import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import type { Snapshot } from "./types";

// Chrome writes this file when remote debugging is on (chrome://inspect/#remote-debugging,
// or --remote-debugging-port). Reading it finds the browser without guessing a port.
const PROFILE_DIRS = [
  "Library/Application Support/Google/Chrome",
  "Library/Application Support/Google/Chrome Beta",
  "Library/Application Support/Google/Chrome Canary",
  "Library/Application Support/Chromium",
  ".config/google-chrome",
  ".config/chromium",
].map((d) => join(homedir(), d));

async function activePortEndpoint(): Promise<string | undefined> {
  for (const dir of PROFILE_DIRS) {
    try {
      const [port, path] = (await readFile(join(dir, "DevToolsActivePort"), "utf8")).trim().split("\n");
      if (port && path) return `ws://127.0.0.1:${port}${path}`;
    } catch {}
  }
}

export const CONNECT_HELP = `Could not reach Chrome's DevTools endpoint.

Turn on remote debugging for the Chrome you're using, once:
  1. Open chrome://inspect/#remote-debugging
  2. Enable "Allow remote debugging for this browser instance"
  3. Re-run, and approve Chrome's "allow remote debugging" prompt

Or start a separate Chrome with a debug port and pass --cdp:
  open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.jev-audit-chrome"
  npm run audit -- --cdp http://127.0.0.1:9222`;

export async function connect(cdp?: string): Promise<Browser> {
  const endpoint = cdp ?? (await activePortEndpoint()) ?? "http://127.0.0.1:9222";
  try {
    return await chromium.connectOverCDP(endpoint, { timeout: 8000 });
  } catch (err) {
    throw new Error(`${CONNECT_HELP}\n\n(${endpoint}: ${(err as Error).message.split("\n")[0]})`);
  }
}

const INTERNAL = /^(chrome|chrome-extension|devtools|about|edge):/;

async function focusState(page: Page): Promise<number> {
  const probe = page
    .evaluate(() => (document.hasFocus() ? 2 : document.visibilityState === "visible" ? 1 : 0))
    .catch(() => 0);
  const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(0), 1500));
  return Promise.race([probe, timeout]);
}

/** The tab you're looking at: focused beats visible beats the most recently opened. */
export async function pickTab(browser: Browser, match?: string): Promise<Page> {
  const pages = browser.contexts().flatMap((c) => c.pages()).filter((p) => !INTERNAL.test(p.url()));
  if (!pages.length) throw new Error("No web pages are open in that Chrome.");
  if (match) {
    const needle = match.toLowerCase();
    for (const p of pages) {
      if (p.url().toLowerCase().includes(needle) || (await p.title()).toLowerCase().includes(needle)) return p;
    }
    throw new Error(`No open tab matches "${match}".`);
  }
  const states = await Promise.all(pages.map(focusState));
  const best = Math.max(...states);
  return best > 0 ? pages[states.lastIndexOf(best)] : pages[pages.length - 1];
}

const EXTRACT = readFile(new URL("./extract.browser.js", import.meta.url), "utf8");

export async function snapshot(page: Page, opts: { fullPage: boolean; max: number }): Promise<Snapshot> {
  const fn = (await EXTRACT).replace(/^\s*\/\/.*$/gm, "").trim();
  return page.evaluate(`(${fn})(${JSON.stringify(opts)})`) as Promise<Snapshot>;
}
