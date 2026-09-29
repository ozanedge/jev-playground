# jev-playground

A working app built on **Jev**, [TypeSafe AI](https://typesafe.ai)'s System One model.
Jev doesn't write text: you give it state and typed questions (`choice`, `score`,
`noul`) and it returns typed answers with calibrated probabilities and confidence.

> **Status:** scaffold only. The structure, the Jev client, one example decision and
> an API route are in place; the app itself is still to be built.

## Stack

Next.js (App Router) · TypeScript · [`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript) ·
Vitest · deploys to Vercel.

## Getting started

```sh
npm install
cp .env.example .env.local   # add your TYPESAFE_API_KEY
npm run dev
```

Try the example decision:

```sh
curl -s localhost:3000/api/decide -H 'content-type: application/json' \
  -d '{"message":"Stripe integration has failed for 3 days, losing sales, help ASAP"}'
```

## `npm run audit` — copy-clarity audit of your current Chrome tab

Reads the tab you're looking at in your own Chrome (logged-in dashboards included) and
ranks copy that's hard to understand:

| Issue | Judged by |
| --- | --- |
| vague action — a button, link, tab or menu item whose label doesn't say what it does | Jev |
| unclear label — a heading, column header or field label that doesn't say what it covers | Jev |
| jargon — internal terms, raw identifiers, unexplained abbreviations | Jev |
| unhelpful problem message — reports an error/empty state without a cause or next step | Jev (two judgments, combined in code) |
| truncated label, control with no label, leaked raw value (`undefined`, `{{var}}`, …) | code |

```sh
export TYPESAFE_API_KEY=...
npm run audit                        # focused tab, what's on screen
npm run audit -- --full-page         # include below the fold
npm run audit -- --tab billing       # a specific tab by URL/title
npm run audit -- --json | jq .       # machine-readable
npm run audit -- --dry-run           # show what would be sent; no API call
```

One-time Chrome setup: open `chrome://inspect/#remote-debugging` and enable remote
debugging for this browser instance (Chrome asks you to approve each connection).

How it works: code turns the page into text (Jev reads text, not pixels): each
on-screen control, heading, column, field and message with its section and region.
Each element gets 2–3 narrow yes/no questions, batched 30 elements per request and sent
in parallel. Code inverts, combines and weights the probabilities (a dialog button
matters more than a sidebar link) and ranks them. Table cells are checked in code
only and never sent to Jev.

## Layout

```
src/
  app/               UI + API routes (api/decide is the placeholder endpoint)
  decisions/         one file per decision Jev makes (triage.ts is the example)
  audit/             the copy-clarity CLI: browser.ts (CDP), extract.browser.js (page → text),
                     questions.ts (Jev questions), rank.ts (policy), cli.ts
  lib/jev.ts         server-only TypeSafe client + model pin
  lib/confidence.ts  act-vs-review gating on answer confidence
tests/               vitest
docs/                architecture notes
```

See [docs/architecture.md](docs/architecture.md) for the design rule.

## Scripts

| | |
| --- | --- |
| `npm run dev` | local dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests |
| `npm run build` | production build |

## Links

- [TypeSafe docs](https://docs.typesafe.ai/) · [Playground](https://console.typesafe.ai/playground) · [API keys](https://console.typesafe.ai/keys)

## License

Apache-2.0
