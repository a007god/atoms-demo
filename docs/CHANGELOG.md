# Changelog

All notable changes per development session. Maintained alongside the code; one commit per session at the bottom.

---

## Session 2 — 2026-05-31 — Data layer + Auth (SPEC §1.5, §1.1)

### S2-2 — Auth.js v5 Credentials + signup/login closed loop

#### Added

- **Split Auth.js config** (the canonical v5 pattern for edge-compatible middleware):
  - `src/lib/auth/config.edge.ts` — edge-safe base (JWT session strategy, `pages.signIn = "/login"`, `authorized` callback for route gating, `jwt` + `session` callbacks that thread `user.id`). No Prisma / no DB import.
  - `src/lib/auth/index.ts` — full config = edge base + `Credentials` provider. `authorize` parses with Zod, looks up the user, `bcryptjs.compare`s the password, throws a custom `InvalidCredentials extends CredentialsSignin` on any failure. Augments `next-auth` Session type with `user.id`.
- **Route handler**: `src/app/api/auth/[...nextauth]/route.ts` re-exports `handlers.GET` / `handlers.POST`.
- **Auth (auth) section** under `src/app/(auth)/`:
  - `layout.tsx` — centered card.
  - `login/page.tsx` — client form, `useActionState` → `loginAction`.
  - `signup/page.tsx` — same shape, calls `signupAction`.
  - `actions.ts` — Server Actions: `loginAction` (`signIn` + AuthError → friendly zh message), `signupAction` (Zod parse → uniqueness check → `bcrypt.hash` → `prisma.user.create` → auto `signIn`), `logoutAction` (`signOut → /login`).
- **Home page** `src/app/page.tsx` rewritten to a minimal session-aware view (welcome line, email/id readout, logout button). CNA welcome content discarded.

#### Changed

- **Renamed `src/middleware.ts` → `src/proxy.ts`** — Next 16 deprecated the `middleware` file convention; the new name is `proxy`, and the function must be the default export (or named `proxy`). The proxy invokes `NextAuth(authConfigEdge).auth` and the matcher excludes `/api/auth/*`, Next static assets, favicon, and any path with a file extension.
- `config.edge.ts` `authorized` callback: removed the `/` exemption so the home page now requires a session (anonymous → 307 to `/login?callbackUrl=...`).

#### Verification

- `pnpm exec tsc --noEmit` — 0 errors.
- `pnpm dev` ready; `GET /api/auth/providers` returns the registered credentials provider; `GET /` while anonymous → 307 to `/login?callbackUrl=%2F` (proxy is wired).
- Browser e2e verified by user: signup → auto-signIn → home shows session → logout → login → home. Negative paths: wrong password shows "邮箱或密码错误", duplicate-email signup shows "该邮箱已注册". `User` row in `dev.db` stores `passwordHash` as bcrypt (`$2b$10$…`), not the original password.

### S2-1 — Prisma data layer

#### Added

- **Prisma models** in `prisma/schema.prisma` per SPEC §5:
  - `User` (email-unique, passwordHash, locale, credits)
  - `Project` (ownerId → User, defaultMode, providerPref)
  - `Conversation` (projectId → Project, mode)
  - `Message` (conversationId → Conversation, role, agent, content, tokens)
  - All cuid IDs, cascade deletes along the ownership chain, indexes on `Project.ownerId` / `Conversation.projectId` / `Message.(conversationId, createdAt)`.
  - Auth.js Account/Session tables skipped — using JWT session strategy.
  - RaceRun / RaceCandidate deferred to extension 2.1.
- **First migration**: `prisma/migrations/20260531015439_init/migration.sql`, applied to local `dev.db`.
- **Prisma 7 driver adapter**: installed `@prisma/adapter-better-sqlite3` + `better-sqlite3` (Prisma 7 dropped the bundled engine; an adapter is now mandatory). Native build approved via `pnpm-workspace.yaml`.
- **Client singleton** at `src/lib/db/index.ts` — `globalThis` cache for Next dev HMR, strips `file:` prefix off `DATABASE_URL`, dev logs `warn`+`error`.
- **package.json scripts**: `postinstall: prisma generate`, `build: prisma generate && next build`, `db:migrate`, `db:studio`.

#### Verification

- `pnpm exec tsc --noEmit` — 0 errors.
- `pnpm prisma migrate dev --name init` — applied cleanly, `dev.db` created.
- `pnpm install` re-run — `postinstall` regenerates client; `better-sqlite3` native build OK.

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
