import type { AgentId } from "./definitions";

export type ChatMode = "chat" | "team";

/**
 * Initial worklist per mode.
 * - `chat`: single anonymous call (no agent attribution).
 * - `team`: starts with Mike only — he decides who's next via @mentions.
 *   If Mike doesn't @mention anyone, the system falls through to the
 *   default sequence as a safety net.
 *
 * `null` in the array represents "no agent persona" — used so the orchestrator
 * loop can treat single-call chat as just a 1-step pipeline.
 */
export const PIPELINES: Record<ChatMode, (AgentId | null)[]> = {
  chat: [null],
  team: ["mike"],
};

export const DEFAULT_TEAM_FALLBACK: AgentId[] = ["emma", "alex"];
