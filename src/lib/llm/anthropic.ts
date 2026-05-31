import Anthropic from "@anthropic-ai/sdk";
import type { LLMMessage, LLMProvider, LLMStreamOptions } from "./types";

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;

  constructor(private readonly model: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseURL = process.env.ANTHROPIC_BASE_URL;
    if (!apiKey || !baseURL) {
      throw new Error(
        "AnthropicProvider requires ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL (the proxy base, no /v1).",
      );
    }
    this.client = new Anthropic({ apiKey, baseURL });
  }

  async *stream(
    messages: LLMMessage[],
    opts?: LLMStreamOptions,
  ): AsyncIterable<string> {
    // Anthropic's API expects the system prompt separately from the conversation.
    const systemMsg = messages.find((m) => m.role === "system");
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        system: systemMsg?.content,
        messages: conversation,
      },
      { signal: opts?.signal },
    );

    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        yield ev.delta.text;
      }
    }
  }
}
