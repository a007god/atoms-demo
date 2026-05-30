# Changelog

All notable changes per development session. Maintained alongside the code; one commit per session at the bottom.

---

## Session 1 — 2026-05-31 — Scaffold

### Added

- **Toolchain**
  - Project bootstrapped on Node 24 LTS + pnpm 11.5; npm registry pointed at `registry.npmmirror.com` for stability in CN.
  - PowerShell `ExecutionPolicy` set to `RemoteSigned` (CurrentUser) so pnpm shims run.
- **Next.js 16 scaffold** via `pnpm create next-app` (App Router, TypeScript, Tailwind v4, ESLint 9, `src/`, Turbopack, no Biome).
- **TypeScript** bumped to `6.0.3` to clear the Next 16 "TS < 5.1" warning.
- **shadcn/ui (manual)** — CLI is broken under Zod 4 due to MCP SDK importing `zod/v3`. Initialized by hand:
  - `components.json` (baseColor `neutral`, RSC, src-dir aliases).
  - `src/lib/utils.ts` with `cn()`.
  - `src/app/globals.css` replaced with the neutral OKLCH theme (light + dark, `tw-animate-css`, `@theme inline`, `@layer base`).
  - Deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.
- **SPEC §8.6 runtime deps** (all installed): `prisma`, `@prisma/client`, `bcryptjs` (+ `@types/bcryptjs`), `zod`, `zustand`, `next-auth@beta`, `ai`, `@ai-sdk/react`, `openai`, `@anthropic-ai/sdk`, `next-intl`, `dotenv`.
- **Prisma 7** initialized:
  - `prisma/schema.prisma` with the new `prisma-client` generator emitting to `src/generated/prisma`, SQLite datasource.
  - `prisma.config.ts` loads `.env` via `dotenv/config` and wires `datasource.url`.
  - No models defined yet — first migration deferred until Session 2.
- **i18n placeholders**: `messages/zh.json` and `messages/en.json` with a `common.appName` entry. next-intl middleware/runtime config will be wired when feature work needs it.
- **Env files**
  - `.env` (committable) — `DATABASE_URL="file:./dev.db"` only.
  - `.env.example` (committable) — full template with empty values + comments (e.g., `OPENAI_BASE_URL` ends in `/v1`, `ANTHROPIC_BASE_URL` does not; `DEFAULT_PROVIDER=mock`).
  - `.env.local` (gitignored) — real secrets only on local machine.
- **`pnpm-workspace.yaml`** with `allowBuilds` opting in `@parcel/watcher`, `@prisma/engines`, `@swc/core`, `prisma`, `sharp`, `unrs-resolver` so pnpm 11's "blocked build scripts" warning goes away.
- **Docs**
  - `docs/SPEC.md` v0.4 — authoritative design (基础功能 / 扩展功能 / 创新延展 placeholder + tech stack, data model, API surface, env, deploy).
  - `README.md` rewritten for the project (stack, quick-start, env notes, demo URL placeholder).
  - `CLAUDE.md` — implementation order, pnpm + LLM proxy + shadcn-CLI-broken notes; `@AGENTS.md` include.
  - `AGENTS.md` kept (CNA-generated reminder that Next 16 differs from training data).
  - `docs/CHANGELOG.md` — this file.
- **Git** initialized on `main` branch.

### Changed

- `.gitignore` hardened: **all** `.env` / `.env.*` ignored; only `.env.example` is whitelisted. The Prisma-generated `.env` (which only held `DATABASE_URL`) is moved into the template so a fresh clone can recreate it locally. Rationale: future-proofing against accidentally writing a secret into `.env`.
- `prisma.config.ts` now reads both `.env` and `.env.local` (later overrides earlier) so `DATABASE_URL` can live in either.
- `docs/SPEC.md` §4.1/§4.4 version pinned to actual install: Next.js 16, TypeScript 6, Prisma 7. Previously read "15+" / "5+" which was lazy.
- `.claude/*.local.json` added to `.gitignore` for per-user Claude Code overrides.

### Known follow-ups (deferred to Session 2+)

- No Prisma models yet — User / Project / Conversation / Message land with §1 work.
- next-intl middleware not wired — only dictionaries exist.
- shadcn components copy-pasted on demand (CLI route blocked).
- Live demo URL pending Vercel + Neon deploy.

### Verification

- `pnpm exec tsc --noEmit` — 0 errors.
- `pnpm dev` — Ready in ~1.7s at <http://localhost:3000>.
