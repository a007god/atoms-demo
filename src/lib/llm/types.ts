export type LLMRole = "system" | "user" | "assistant";

export type TextBlock = { type: "text"; text: string };
export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
export type ContentBlock = TextBlock | ImageBlock;

export type LLMMessage = {
  role: LLMRole;
  content: string | ContentBlock[];
};

export type LLMStreamOptions = {
  signal?: AbortSignal;
};

/**
 * Minimal streaming chat interface. Implementations yield content deltas
 * (strings) and may yield empty strings to keep the stream alive — consumers
 * should accumulate by concatenation.
 */
export interface LLMProvider {
  readonly id: string;
  stream(
    messages: LLMMessage[],
    opts?: LLMStreamOptions,
  ): AsyncIterable<string>;
}
