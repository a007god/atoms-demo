# Atoms Demo

一个 [Atoms.dev](https://atoms.dev) 风格的 AI 多智能体应用工厂。用户用自然语言描述创意，一支带角色分工的 AI 团队（Mike / Emma / Alex 等 7 人）协作产出可运行的网页应用，并在沙箱中实时预览。

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 6 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Prisma 7 — SQLite (dev) / PostgreSQL (prod) |
| Auth | Auth.js v5 (Credentials, JWT session) |
| LLM | Anthropic SDK + OpenAI SDK, NewAPI proxy |
| Deploy | Vercel + Neon Postgres |

## Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in your API keys (see .env.example for details)

# 3. Initialize local database (SQLite)
pnpm db:migrate

# 4. Start dev server
pnpm dev
```

App runs at http://localhost:3000.

## Environment Variables

See `.env.example` for the full template. Key points:

- `DATABASE_URL="file:./dev.db"` for local SQLite; Postgres connection string for production
- `OPENAI_BASE_URL` must end with `/v1`; `ANTHROPIC_BASE_URL` must NOT
- `DEFAULT_PROVIDER=mock` works offline without any API key

## Features

- Multi-agent team collaboration (7 agents with distinct roles and personalities)
- Mode switching: Chat / Team / Engineer
- @mention routing — target specific agents directly
- Live HTML preview panel (App Viewer) with desktop/mobile viewport
- File drag-and-drop upload (text + images, multimodal LLM support)
- 3 color themes (Warm / Dark / Ocean) with persistence
- ZIP export for generated HTML
- Full auth flow (register / login / logout)
- Project CRUD with conversation history

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login / Signup pages
│   ├── (app)/           # Authenticated app shell
│   │   ├── projects/    # Project detail + chat
│   │   └── _components/ # Sidebar, welcome, theme switcher
│   └── api/chat/        # SSE streaming endpoint
├── lib/
│   ├── llm/             # Provider abstraction (mock/openai/anthropic)
│   ├── agents/          # Agent definitions + pipeline orchestration
│   ├── auth/            # Auth.js config
│   └── db/              # Prisma client (dual SQLite/Pg adapter)
└── generated/prisma/    # Generated Prisma client
```

## Documentation

- `docs/SPEC.md` — Full design spec (features, data model, API, deployment)
- `docs/CHANGELOG.md` — Per-session development log
