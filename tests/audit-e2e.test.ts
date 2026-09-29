// End to end without a TypeSafe key: real headless Chrome → the CLI over CDP →
// a fake /v1/systemone that answers from simple rules. Tests the plumbing
// (capture, batching, keys, ranking, output), not Jev's judgment.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE = pathToFileURL(join(__dirname, "fixtures/dashboard.html")).href;
const VAGUE = new Set(["Submit", "OK", "More", "Value", "Name", "Learn more"]);

let chrome: ChildProcess;
let profile: string;
let cdp: string;
let fake: Server;
let fakeURL: string;
const requests: { state: any; questions: Record<string, any> }[] = [];

function answer(check: string, text: string): number {
  switch (check) {
    case "clear_action":
    case "clear_label":
      return VAGUE.has(text) ? 0.1 : 0.95;
    case "jargon":
      return /ERR_|_uuid/.test(text) ? 0.9 : 0.05;
    case "is_problem":
      return /Error|No data/.test(text) ? 0.9 : 0.05;
    default: // actionable
      return 0.1;
  }
}

beforeAll(async () => {
  profile = mkdtempSync(join(tmpdir(), "jev-audit-chrome-"));
  chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", FIXTURE,
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
  cdp = `ws://127.0.0.1:${port}${path}`;

  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { state, questions } = JSON.parse(body);
      requests.push({ state, questions });
      const answers: Record<string, unknown> = {};
      for (const [key, q] of Object.entries<any>(questions)) {
        const i = Number(/elements\[(\d+)\]/.exec(JSON.stringify(q.instructions))![1]);
        answers[key] = { type: "noul", noul: answer(key.split(".")[1], state.elements[i].text) };
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: "jev-fake", answers, usage: { input_tokens: 1000, output_tokens: 0 } }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
  fakeURL = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
}, 30_000);

afterAll(async () => {
  fake?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((r) => chrome.once("exit", r));
    chrome.kill();
    await exited; // Chrome writes to its profile while shutting down
  }
  if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
});

// Async on purpose: the fake server shares this event loop, so a sync spawn deadlocks.
async function audit(...args: string[]) {
  const { stdout } = await promisify(execFile)("npx", ["tsx", "src/audit/cli.ts", "--cdp", cdp, ...args], {
    env: { ...process.env, TYPESAFE_API_KEY: "test", TYPESAFE_BASE_URL: fakeURL },
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

describe.skipIf(!existsSync(CHROME))("jev-audit end to end", () => {
  it("captures on-screen copy only, unless --full-page", async () => {
    const onScreen = JSON.parse(await audit("--dry-run", "--json")).snapshot;
    const texts = onScreen.elements.map((e: any) => e.text);
    expect(texts).toContain("Pause campaign");
    expect(texts).toContain("Learn more"); // a link inside a paragraph is still its own element
    expect(texts).not.toContain("Below the fold: only audited with --full-page.");

    const full = JSON.parse(await audit("--dry-run", "--json", "--full-page")).snapshot;
    expect(full.elements.map((e: any) => e.text)).toContain("Below the fold: only audited with --full-page.");

    const ok = onScreen.elements.find((e: any) => e.text === "OK");
    expect(ok).toMatchObject({ kind: "button", region: "dialog", context: "Dialog: Delete campaign?" });
  }, 30_000);

  it("sends only copy to Jev and ranks code + Jev findings", async () => {
    const out = JSON.parse(await audit("--json"));
    const got = out.findings.map((f: any) => `${f.issue}:${f.element.text}`);

    expect(got).toEqual(expect.arrayContaining([
      "vague_action:Submit",
      "unclear_label:Value",
      "jargon:Error: ERR_QUOTA_EXCEEDED (tenant_uuid=8f2c)",
      "unhelpful_error:No data",
      "truncated:Duplicate campaign with new budget",
      "no_label:",
      "raw_value:{{campaign_value}}",
    ]));
    expect(got).not.toContain("vague_action:Pause campaign");

    const sent = requests.flatMap((r) => r.state.elements.map((e: any) => e.kind));
    expect(sent).not.toContain("cell"); // table data is checked in code, never sent
    expect(out.usage).toMatchObject({ model: "jev-fake" });
  }, 30_000);

  it("prints a ranked report", async () => {
    const text = await audit();
    expect(text).toMatch(/Copy audit — Campaigns · Acme Ads Manager/);
    expect(text).toMatch(/vague action\s+button\s+"Submit"/);
  }, 30_000);
});
