@AGENTS.md

# Atoms Demo

This is a take-home for ROOT's full-stack role. The authoritative spec lives at `docs/SPEC.md`.

Implementation order:
1. Finish all of `docs/SPEC.md` §1 "基础功能" first.
2. Then `docs/SPEC.md` §2 "扩展功能" in the listed priority order.
3. `docs/SPEC.md` §3 "创新延展" is parked — do not start without confirming.

Project notes:
- Use **pnpm**, not npm.
- LLM goes through a NewAPI proxy: same key serves OpenAI- and Anthropic-style endpoints. See `.env.example`.
- shadcn CLI is currently broken under Zod 4 (MCP SDK incompat). Add components by copying from <https://ui.shadcn.com> into `src/components/ui/` manually.
