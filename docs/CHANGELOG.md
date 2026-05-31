# Changelog

All notable changes per development session. Maintained alongside the code; one commit per session at the bottom.

---

## Session 4 — 2026-05-31 — @mention routing + HTML preview panel

Two new features that extend the chat experience: targeted agent routing via @mentions, and a live HTML preview panel (App Viewer).

### @mention agent routing

- **Mention popover** (`mention-popover.tsx`): typing `@` in the chat textarea opens a dropdown listing all 7 agents. Filters as you type, supports keyboard navigation (↑↓ Enter Esc).
- **Parse & route**: on send, `@AgentName` tokens are extracted from the message. If present, the backend routes to exactly those agents in @ order (serial), bypassing the mode-based pipeline.
- **API extension**: `/api/chat` body schema now accepts an optional `agents: AgentId[]` field. When provided, it overrides the `mode`-based pipeline lookup.
- **UX**: placeholder text updated to hint at `@` usage. Multiple @mentions supported (e.g., `@Bob @Alex` → Bob then Alex).

### HTML preview panel (App Viewer — SPEC §2.4)

- **Auto-detection**: when any assistant message contains a fenced ` ```html ` code block, the right-side preview panel opens automatically. Updates live during streaming (partial blocks render as they arrive).
- **Split layout**: project detail page now uses `ProjectWorkspace` wrapper — left half is chat, right half is the iframe preview. Panel only appears when HTML is detected; closes via ✕ button.
- **Viewport toggle**: desktop (full-width) / mobile (375px) switch in the preview header.
- **Security**: iframe uses `sandbox="allow-scripts"` (no `allow-same-origin`) + `srcDoc` injection.
- **New files**: `html-preview-panel.tsx`, `project-workspace.tsx`.

### Plumbing

- `src/lib/agents/index.ts`: added `AGENT_LIST` convenience export.
- `chat-panel.tsx`: new `onHtmlDetected` callback prop; `extractLatestHtml()` utility exported for reuse.
- `page.tsx` (project detail): now renders `<ProjectWorkspace>` instead of `<ChatPanel>` directly.

### Verification

- `tsc --noEmit` — 0 errors.
- `next dev` — starts cleanly on port 3000.

---

## Session 3 — 2026-05-31 — App shell + Chat/SSE + Multi-agent + UI polish

Covers SPEC §1.2 + §1.3 + §1.4 in one stretch, plus a layout refactor and the modal/markdown pattern decisions.

### S2-4 — Project CRUD (SPEC §1.2)

#### Server actions — `src/app/(app)/projects/actions.ts`

- `createProject` — Zod name validation → insert → layout-level revalidate → redirect to detail.
- `renameProject(id, formData)` — uses `updateMany({ where: { id, ownerId } })` because `(id, ownerId)` isn't a declared compound unique. The `count === 0` guard rejects cross-tenant edits without a separate fetch.
- `deleteProject(id)` — symmetric `deleteMany` + `count === 0` guard. NO server-side redirect (client decides — see below).
- `startNewProject(formData)` — entry from the welcome screen. Validates the first message, derives a project name from its first 30 chars, persists `defaultMode` from the welcome's mode toggle, then redirects to `/projects/[id]?prompt=<encoded>` so the chat panel auto-sends the first turn.
- All actions call a `requireUserId()` helper that redirects to `/login` on missing session (defense-in-depth; proxy should already catch).

#### Detail page — `src/app/(app)/projects/[id]/page.tsx`

- Ownership-scoped `findFirst` (so cross-tenant URL probing → `notFound()`).
- Loads existing messages from the (lazy) conversation + reads `defaultMode` for the chat panel's initial mode.

### App shell — `(app)` route group

- New route group `src/app/(app)/` wraps every logged-in page.
- `layout.tsx` provides the sidebar shell (left rail + main pane). Fetches `session` + `projects` once for the rail.
- Sidebar layout:
  - Clickable app logo → `/` (welcome).
  - "+ 新对话" button → `/`.
  - Scrollable project list with active-state highlight via `usePathname`.
  - Bottom: user identity + logout form.
- `/` page rewritten as a centered WelcomeChat (replaces the old project-list-on-home).

### Sidebar UX — `_components/project-list.tsx`

- Each row hover-reveals a **kebab (⋮) menu** (rebuilt from scratch — hand-rolled outside-click + Esc close).
- Menu items: **重命名**, **删除**.
- Both confirms use the HTML5 `<dialog>` modal pattern (see "Modal pattern" below), not native `window.confirm` / `alert`.
- Rename dialog: input pre-filled with current name, key-based remount resets dirty edits between opens.
- Delete dialog: destructive-styled confirm with copy explaining the cascade.
- Rename + delete actions both client-action-wrap the server action so the dialog can `setOpen(false)` on success.

### Modal pattern (memory: `feedback-modal-pattern`)

- Decision: use HTML5 `<dialog>` + `.showModal()` for all confirms/dialogs going forward; **never** `window.confirm` / `alert`.
- Centering: `fixed left-1/2 top-1/2 right-auto bottom-auto -translate-x-1/2 -translate-y-1/2` — Tailwind preflight + the UA `dialog[open] { inset: 0; margin: auto }` interact badly; the translate trick is bulletproof regardless of intrinsic size.
- Backdrop: `backdrop:bg-black/40` via Tailwind's `::backdrop` variant.
- React state ↔ native dialog synced via `useEffect` + `onClose`.
- Reusable `Modal` helper extracted inside `project-list.tsx` for now; will extract to its own file once a second feature reuses it.

### S2-5 — Single-agent chat + SSE streaming (SPEC §1.3)

#### LLM provider abstraction — `src/lib/llm/`

- `types.ts` — `LLMMessage` (role/content) + `LLMProvider` interface (`stream(messages, opts?) → AsyncIterable<string>`).
- `mock.ts` — character-level fake streaming with configurable delay; respects `AbortSignal`.
- `openai.ts` — wraps the `openai` SDK with custom `baseURL` for the NewAPI proxy. Yields content deltas.
- `anthropic.ts` — wraps `@anthropic-ai/sdk`; separates the `system` message into the dedicated field and filters it out of the conversation.
- `index.ts` — `getProvider()` selects by `DEFAULT_PROVIDER` env, with model picked from `DEFAULT_OPENAI_MODEL` / `DEFAULT_ANTHROPIC_MODEL` (or per-call override).

#### `/api/chat` route — `src/app/api/chat/route.ts`

- Auth + Zod body parse + ownership check.
- Lazy-creates one `Conversation` per project (v1 = single-conversation projects).
- Pulls the last 50 history rows for context, persists the new user `Message`, then streams.
- SSE event protocol (consumed by `chat-panel.tsx`):
  - `user-saved { tempId, messageId }` — echoes client's optimistic id, lets the client swap to the persisted id.
  - `start { tempId, agent }` — new assistant bubble begins (with agent attribution, null in single-agent mode).
  - `delta { tempId, text }` — text chunk.
  - `saved { tempId, messageId }` — assistant message persisted, swap temp id.
  - `done` — pipeline finished.
  - `error { message }` — stream failure.
- `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` for proxy-friendliness.

#### Chat panel — `src/app/(app)/projects/[id]/_components/chat-panel.tsx`

- Client component. Maintains `messages[]`, `input`, `mode`, `streaming`, `error`.
- Optimistic user-message append; `fetch` POST with `ReadableStream` reader + SSE event splitter (`\n\n` delimited `data:` lines).
- Auto-scroll to bottom on `messages` change.
- Aborts in-flight request on unmount + on user "停止" click.
- Reads `?prompt=` query param on mount → auto-sends the welcome screen's first message, then `history.replaceState` so reload doesn't re-fire.
- Textarea-based input (rows=3, auto-grow up to 240px), Enter sends / Shift+Enter newline.

### S2-6 — Multi-agent role-play (SPEC §1.4)

#### Agent definitions — `src/lib/agents/definitions.ts`

- 7 agents borrowed from Atoms: Mike (Team Leader), Emma (PM), Bob (Architect), Alex (Engineer), David (Data), Iris (Researcher), Sarah (SEO).
- Each carries: name, role, description, Tailwind accent classes for the visual badge, and a Chinese system prompt (per the deferred-i18n decision).

#### Pipelines — `src/lib/agents/pipelines.ts`

- `chat` mode = `[null]` (single anonymous call — reuses the same orchestration loop).
- `team` mode = `["mike", "emma", "alex"]` for v1.
- Bob / David / Iris / Sarah defined but not on any pipeline yet.

#### Orchestration — `/api/chat` extended

- For each step in the pipeline:
  - Build outgoing messages = `[system?, ...normalizedHistory, composedUser]`.
  - `normalizedHistory`: collapses consecutive assistant rows (one per agent in team mode) into a single `assistant` so the sequence strictly alternates user/assistant (Anthropic refuses anything else).
  - `composedUser`: original user message + prior agents' outputs in THIS turn folded in as one user-block (`【Mike (Team Leader) 的输出】\n…`). This guarantees messages always end with `user` — fixes the **Emma → 400 Invalid request** bug seen against Claude.
  - Stream chunks via `provider.stream`, persist as `Message { role: assistant, agent: agentId }`, emit `start`/`delta`/`saved` events.

#### Mode toggle UX

- Per-project `mode` state in the chat panel; `initialMode` comes from `Project.defaultMode`.
- Welcome screen also has a mode toggle, persisted via the hidden form input → `startNewProject` writes `Project.defaultMode`.
- Old segmented-pill toggle replaced by an `ActionsMenu` "+" button (see below).

### Welcome standby + ActionsMenu

- `(app)/page.tsx` = WelcomeChat: centered heading + multiline textarea with auto-resize.
- New `ActionsMenu` (`_components/actions-menu.tsx`) — "+" button with upward popover, used on BOTH welcome and chat-panel input bars:
  - **团队接力模式** — checkable, drives the `mode` state.
  - **添加附件** — disabled with "即将上线" badge, placeholder for future.
- Hand-rolled outside-click + Esc handling (consistent with the kebab menu; no Radix).

### Markdown rendering — `markdown-message.tsx`

- Installed `react-markdown` + `remark-gfm`.
- Custom element renderers for `p`/`h1-3`/`ul`/`ol`/`li`/`blockquote`/`a`/`hr`/`strong`/`em`/`pre`/`code`/`table`.
- Inline vs block code discriminated by `language-*` className OR presence of `\n` (react-markdown v9 removed the `inline` prop).
- Assistant bubbles render via `<MarkdownMessage>`; user bubbles stay plain `whitespace-pre-wrap` (typing markdown in your own message looks weird).
- No syntax highlighting (shiki/prism too heavy for v1).

### Plumbing & fixes

- `proxy.ts`: matcher updated to exclude all of `/api/*` (was only excluding `/api/auth/*`). Fetch hits on `/api/chat` were getting 307-redirected to `/login` HTML, breaking SSE parsing.
- `Project.defaultMode` persisted from welcome's mode toggle (default `"chat"`), re-read on detail page mount.
- Layout-level `revalidatePath("/", "layout")` on all project mutations so the sidebar's project list re-renders without a hard reload.

### Real model wiring + validation

- Pinged every candidate against the NewAPI proxy at `https://mynewapi.n1neman.fun`:
  - ❌ `deepseek-v4-flash`, `grok-4.1-fast` — not in proxy's `/v1/models` at all.
  - ❌ `gpt-5.4`, `gpt-5.4-mini`, `gemini-3-flash` — listed in `/v1/models` but distributor has no working channel (503 / 500 / timeout).
  - ✅ Claude family — `claude-haiku-4-5`, `claude-sonnet-4-6`, etc. — works over both the openai-compat and the native anthropic endpoints.
- `.env.local` final picks:
  - `DEFAULT_PROVIDER="anthropic"` (was `mock`).
  - `DEFAULT_ANTHROPIC_MODEL="claude-sonnet-4-6"` — best persona/role adherence among working models; the demo's "wow" is distinct Mike/Emma/Alex voices.
  - `DEFAULT_OPENAI_MODEL="claude-haiku-4-5"` — cheap fallback if we switch to the openai-protocol path.

### Spec updates

- `docs/SPEC.md` §1.7: explicitly marked i18n as **deferred** to post-§1+§2.
- §4.1: Next.js version pinned to 16, TypeScript to 6 (matches actual installs).
- §4.4: Prisma row notes the new `prisma-client` generator.

### Verification

- `pnpm exec tsc --noEmit` — 0 errors after every commit-worthy step.
- Browser e2e by user: welcome → "+" → tick 团队接力 → send first message → auto-creates project named from message → redirect → Mike → Emma → Alex stream in distinct voices with markdown-rendered code blocks and blockquotes. Rename via kebab dialog, delete via kebab dialog both verified.
- Proxy probe: documented working model is `claude-sonnet-4-6` via native anthropic protocol.

### Deferred (decision recap)

- **next-intl wiring (SPEC §1.7)** — deferred to after §1 base + §2 extensions all ship. v1 ships zh-only. SPEC §1.7 updated to reflect this. UI text stays as Chinese literals (no `t()` calls) until the dedicated i18n sweep.

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
