import type { AgentId } from "./definitions";

export type ChatMode = "chat" | "team";

/**
 * Sequential pipelines per mode.
 * - `chat`: single anonymous call (no agent attribution).
 * - `team`: Mike → Emma → Alex (v1). Bob / David / Iris / Sarah are defined
 *   but not yet on any pipeline.
 *
 * `null` in the array represents "no agent persona" — used so the orchestrator
 * loop can treat single-call chat as just a 1-step pipeline.
 */
export const PIPELINES: Record<ChatMode, (AgentId | null)[]> = {
  chat: [null],
  team: ["mike", "emma", "alex"],
};
