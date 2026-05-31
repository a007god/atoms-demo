export { AGENTS, type AgentId, type AgentDef } from "./definitions";
export { PIPELINES, DEFAULT_TEAM_FALLBACK, type ChatMode } from "./pipelines";

import { AGENTS as _AGENTS } from "./definitions";
export const AGENT_LIST = Object.values(_AGENTS);
