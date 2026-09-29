// jev-audit: read the Chrome tab you're looking at and rank its copy-clarity problems.
//
//   npm run audit                  # focused tab, what's on screen
//   npm run audit -- --full-page   # whole page, not just the viewport
//   npm run audit -- --tab billing --json
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { connect, pickTab, snapshot } from "./browser";
import { evaluate, USD_PER_INPUT_TOKEN, type Usage } from "./evaluate";
import { batches } from "./questions";
import { codeFindings, ISSUE_LABEL, jevFindings, rank } from "./rank";
import type { Finding, Snapshot } from "./types";

const HELP = `Usage: npm run audit -- [options]

  --tab <text>        audit the tab whose URL or title contains <text> (default: focused tab)
  --full-page         include copy below the fold (default: only what's on screen)
  --threshold <p>     minimum probability to report, 0-1 (default 0.6)
  --max <n>           cap on elements captured (default 200)
  --json              machine-readable output
  --dry-run           capture and show what would be asked; no API call
  --cdp <url>         DevTools endpoint (default: auto-detect, then http://127.0.0.1:9222)
  --model <id>        TypeSafe model (default: $JEV_MODEL or jev-latest)

Needs TYPESAFE_API_KEY (except --dry-run).`;

const { values: args } = parseArgs({
  options: {
    tab: { type: "string" },
    "full-page": { type: "boolean", default: false },
    threshold: { type: "string", default: "0.6" },
    max: { type: "string", default: "200" },
    json: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    cdp: { type: "string" },
    model: { type: "string", default: process.env.JEV_MODEL ?? "jev-latest" },
    help: { type: "boolean", short: "h", default: false },
  },
});

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function printReport(snap: Snapshot, findings: Finding[], usage: Usage | undefined, ms: number) {
  const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
  const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

  console.log(bold(`Copy audit — ${snap.title || "(untitled)"}`));
  const meta = [snap.url, `${snap.elements.length} elements`];
  if (usage) {
    meta.push(usage.model, `${usage.requests} req`, `${usage.inputTokens.toLocaleString()} tok`);
    meta.push(`$${(usage.inputTokens * USD_PER_INPUT_TOKEN).toFixed(5)}`);
  }
  meta.push(`${(ms / 1000).toFixed(1)}s`);
  console.log(dim(meta.join(" · ")));
  console.log();

  if (!findings.length) {
    console.log("No copy-clarity problems above the threshold.");
    return;
  }

  findings.forEach((f, i) => {
    const el = f.element;
    const quote = el.text ? `"${truncate(el.text, 60)}"` : dim("(no text)");
    const times = el.count > 1 ? dim(` ×${el.count}`) : "";
    const prob = f.source === "code" ? " code" : f.probability.toFixed(2);
    console.log(
      `${String(i + 1).padStart(3)}  ${prob}  ${ISSUE_LABEL[f.issue].padEnd(22)} ${el.kind.padEnd(9)} ${quote}${times}`,
    );
    console.log(dim(`${" ".repeat(12)}${el.region} › ${truncate(el.context, 70)}`));
  });

  const counts = new Map<string, number>();
  for (const f of findings) counts.set(ISSUE_LABEL[f.issue], (counts.get(ISSUE_LABEL[f.issue]) ?? 0) + 1);
  console.log();
  console.log(dim([...counts].map(([k, v]) => `${v} ${k}`).join(" · ")));
}

async function main() {
  if (args.help) return console.log(HELP);
  const threshold = Number(args.threshold);
  if (!(threshold >= 0 && threshold <= 1)) throw new Error("--threshold must be between 0 and 1");
  if (!args["dry-run"] && !process.env.TYPESAFE_API_KEY) {
    throw new Error("TYPESAFE_API_KEY is not set. Get one at https://console.typesafe.ai/keys (or use --dry-run).");
  }

  const started = Date.now();
  const browser = await connect(args.cdp);
  const page = await pickTab(browser, args.tab);
  const snap = await snapshot(page, { fullPage: args["full-page"], max: Number(args.max) });
  const work = batches(snap);

  if (args["dry-run"]) {
    const questions = work.reduce((n, b) => n + Object.keys(b.questions).length, 0);
    if (args.json) console.log(JSON.stringify({ snapshot: snap, batches: work }, null, 2));
    else {
      console.log(`${snap.title} — ${snap.url}`);
      console.log(`${snap.elements.length} elements → ${work.length} requests, ${questions} questions (not sent)\n`);
      for (const el of snap.elements) {
        console.log(`${el.id.padEnd(5)} ${el.kind.padEnd(9)} ${el.region.padEnd(10)} ${JSON.stringify(truncate(el.text, 60))}${el.count > 1 ? ` ×${el.count}` : ""}`);
      }
    }
    return;
  }

  const client = new TypeSafeClient();
  const { nouls, usage } = await evaluate(client, args.model, work);
  const findings = rank([...codeFindings(snap.elements), ...jevFindings(snap.elements, nouls)], threshold);
  const ms = Date.now() - started;

  if (args.json) {
    console.log(JSON.stringify({ url: snap.url, title: snap.title, usage, findings, nouls }, null, 2));
  } else {
    printReport(snap, findings, usage, ms);
  }
}

// Exit instead of browser.close(): on a CDP connection to your own Chrome, close()
// can take the browser down with it. Dropping the socket just disconnects.
// Flush stdout first: exiting mid-write truncates piped output (--json | jq).
const flushThenExit = (code: number) => process.stdout.write("", () => process.exit(code));
main().then(
  () => flushThenExit(0),
  (err: Error) => {
    console.error(err.message);
    flushThenExit(1);
  },
);
