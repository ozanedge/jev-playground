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

## Layout

```
src/
  app/               UI + API routes (api/decide is the placeholder endpoint)
  decisions/         one file per decision Jev makes (triage.ts is the example)
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
