# Atoms Demo

A small reimagining of [Atoms.dev](https://atoms.dev) — a multi-agent AI workspace where a team of role-specialized agents collaborate to turn a natural-language prompt into a working app.

> Take-home for ROOT's full-stack role. See `docs/SPEC.md` for the full design.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Prisma 7 + SQLite** (Postgres in deploy)
- **Auth.js v5** (Credentials)
- **next-intl** (zh / en)
- **Vercel AI SDK** + OpenAI / Anthropic SDKs over a NewAPI-style proxy
- **shadcn/ui** components (added manually due to a current CLI/Zod 4 incompatibility)

## Quick start

```powershell
pnpm install
cp .env.example .env.local        # then fill in real values
pnpm prisma migrate dev           # once models are defined
pnpm dev
```

App will be at <http://localhost:3000>.

## Env vars

See `.env.example`. The notable ones:

- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — for a NewAPI-style proxy you can use the **same** key for both.
- `OPENAI_BASE_URL` ends in `/v1`; `ANTHROPIC_BASE_URL` does not.
- `DEFAULT_PROVIDER=mock` keeps things offline-friendly out of the box.

## Docs

- `docs/SPEC.md` — full design (基础功能 / 扩展功能, data model, env, deployment)
- `docs/REPORT.md` — submission notes (created at the end)

## Online demo

> Deployed URL will be added once the first feature ships to Vercel.
