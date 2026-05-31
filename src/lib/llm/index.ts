import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./types";

export type ProviderProtocol = "mock" | "openai" | "anthropic";

export type ProviderPref = {
  protocol?: ProviderProtocol;
  model?: string;
};

/**
 * Resolve which provider to use. Precedence:
 *   per-call override > env DEFAULT_PROVIDER > "mock".
 *
 * Model resolution:
 *   per-call override > env DEFAULT_OPENAI_MODEL / DEFAULT_ANTHROPIC_MODEL > hardcoded fallback.
 */
export function getProvider(pref?: ProviderPref): LLMProvider {
  const protocol = pref?.protocol ?? envProtocol() ?? "mock";

  switch (protocol) {
    case "mock":
      return new MockProvider();
    case "openai":
      return new OpenAIProvider(
        pref?.model ?? process.env.DEFAULT_OPENAI_MODEL ?? "gpt-4o-mini",
      );
    case "anthropic":
      return new AnthropicProvider(
        pref?.model ??
          process.env.DEFAULT_ANTHROPIC_MODEL ??
          "claude-haiku-4-5",
      );
  }
}

function envProtocol(): ProviderProtocol | undefined {
  const raw = process.env.DEFAULT_PROVIDER;
  if (raw === "mock" || raw === "openai" || raw === "anthropic") return raw;
  return undefined;
}

export type { LLMMessage, LLMProvider, LLMRole } from "./types";
