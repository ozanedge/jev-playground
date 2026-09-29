// Runs inside the page (page.evaluate). Plain JS on purpose: transpiled TS can
// inject helpers (e.g. __name) that don't exist in the browser.
// Returns the on-screen copy as a flat, text-only list — Jev never sees pixels.
(opts) => {
  const vw = innerWidth;
  const vh = innerHeight;
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const clip = (s) => (s.length > 300 ? s.slice(0, 297) + "..." : s);

  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
    if (el.closest("[aria-hidden=true]")) return false;
    if (!opts.fullPage && (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw)) return false;
    return true;
  };

  const DIALOG = "[role=dialog],[role=alertdialog],dialog";
  const HEADING = "h1,h2,h3,h4,h5,h6,[role=heading]";
  const headings = [...document.querySelectorAll(HEADING)].filter(onScreen);

  const context = (el) => {
    const dlg = el.closest(DIALOG);
    if (dlg) {
      const title =
        norm(dlg.getAttribute("aria-label")) ||
        norm(document.getElementById(dlg.getAttribute("aria-labelledby") || "")?.innerText) ||
        norm(dlg.querySelector(HEADING)?.innerText);
      if (title && title !== norm(el.innerText)) return clip("Dialog: " + title);
    }
    let best = "";
    for (const h of headings) {
      if (h === el || h.contains(el)) continue;
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = norm(h.innerText);
    }
    return clip(best || norm(document.title));
  };

  const region = (el) => {
    if (el.closest(DIALOG)) return "dialog";
    if (el.closest("nav,[role=navigation],[role=menubar],[role=tablist]")) return "navigation";
    if (el.closest("header,[role=banner]")) return "header";
    if (el.closest("aside,[role=complementary]")) return "sidebar";
    if (el.closest("table,[role=grid],[role=table]")) return "table";
    if (el.closest("form")) return "form";
    return "main";
  };

  const kindOf = (el) => {
    const role = el.getAttribute("role");
    const tag = el.tagName.toLowerCase();
    if (role === "tab") return "tab";
    if (role === "menuitem" || role === "option") return "menuitem";
    if (tag === "button" || role === "button" || (tag === "input" && /^(submit|button|reset)$/.test(el.type))) return "button";
    if ((tag === "a" && el.hasAttribute("href")) || role === "link") return "link";
    if (/^h[1-6]$/.test(tag) || role === "heading") return "heading";
    if (tag === "th" || role === "columnheader") return "column";
    if (tag === "td" || role === "gridcell" || role === "cell") return "cell";
    if (/^(input|select|textarea)$/.test(tag)) return "field";
    if (role === "alert" || role === "status" || el.hasAttribute("aria-live")) return "message";
    if (/error|warning|alert|toast|notice|banner|empty/i.test(el.className?.toString?.() || "")) return "message";
    return "text";
  };

  const fieldLabel = (el) => {
    let t = "";
    if (el.id) t = norm(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText);
    if (!t) t = norm(el.closest("label")?.innerText);
    if (!t) t = norm(document.getElementById(el.getAttribute("aria-labelledby") || "")?.innerText);
    if (!t) t = norm(el.getAttribute("aria-label"));
    return t;
  };

  const labelOf = (el, kind) => {
    if (kind === "field") return fieldLabel(el);
    if (kind === "button" && el.tagName === "INPUT") return norm(el.value);
    return norm(el.innerText) || norm(el.getAttribute("aria-label")) || norm(el.getAttribute("title"));
  };

  const truncated = (el) =>
    [el, ...el.querySelectorAll("*")].slice(0, 20).some((n) => {
      const cs = getComputedStyle(n);
      return cs.textOverflow === "ellipsis" && n.scrollWidth > n.clientWidth + 1;
    });

  const SELECTOR = [
    "a[href]", "button", "input", "select", "textarea",
    "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=option]",
    HEADING, "th", "[role=columnheader]",
    "[role=alert]", "[role=status]", "[aria-live]",
    "[class*=error i]", "[class*=warning i]", "[class*=toast i]", "[class*=notice i]", "[class*=empty i]",
    "p", "small", "[class*=help i]", "[class*=hint i]", "[class*=description i]",
    "td", "[role=gridcell]", "[role=cell]",
  ].join(",");

  const PROSE = new Set(["text", "message", "cell"]);
  const captured = new Map(); // element -> kind
  const byKey = new Map();
  const elements = [];
  let cells = 0; // cells get their own cap so a big table can't crowd out the copy

  for (const el of document.querySelectorAll(SELECTOR)) {
    if (el.matches("input[type=hidden]")) continue;
    const kind = kindOf(el);
    if (kind === "cell" ? cells >= opts.max : elements.length - cells >= opts.max) continue;
    // A span inside a button is already covered by the button. Prose only
    // covers prose: a link inside a paragraph is still its own element.
    let covered = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const k = captured.get(p);
      if (k && (!PROSE.has(k) || PROSE.has(kind))) { covered = true; break; }
    }
    if (covered || !onScreen(el)) continue;

    const text = clip(labelOf(el, kind));
    if ((kind === "text" || kind === "cell") && text.length < 3) continue;
    if (kind === "message" && !text) continue;
    captured.set(el, kind);

    const ctx = context(el);
    const key = kind + "\u0000" + text + "\u0000" + ctx;
    const dup = byKey.get(key);
    if (dup) { dup.count++; continue; }

    const item = {
      id: "e" + elements.length,
      kind,
      text,
      context: ctx,
      region: region(el),
      truncated: truncated(el),
      count: 1,
    };
    if (kind === "field" && el.getAttribute("placeholder")) item.placeholder = clip(norm(el.getAttribute("placeholder")));
    byKey.set(key, item);
    elements.push(item);
    if (kind === "cell") cells++;
  }

  return {
    url: location.href,
    title: document.title,
    outline: headings.slice(0, 15).map((h) => clip(norm(h.innerText))).filter(Boolean),
    elements,
  };
}
