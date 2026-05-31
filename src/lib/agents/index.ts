export { AGENTS, type AgentId, type AgentDef } from "./definitions";
export { PIPELINES, type ChatMode } from "./pipelines";

import { AGENTS as _AGENTS } from "./definitions";
export const AGENT_LIST = Object.values(_AGENTS);
