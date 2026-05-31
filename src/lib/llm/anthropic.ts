import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import type { LLMMessage, LLMProvider, LLMStreamOptions, ContentBlock } from "./types";

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
    const systemMsg = messages.find((m) => m.role === "system");
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: toAnthropicContent(m.content),
      }));

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 16384,
        system: systemMsg ? toAnthropicSystem(systemMsg.content) : undefined,
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

function toAnthropicContent(content: string | ContentBlock[]): MessageParam["content"] {
  if (typeof content === "string") return content;
  return content.map((block) => {
    if (block.type === "text") {
      return { type: "text" as const, text: block.text };
    }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: block.source.media_type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: block.source.data,
      },
    };
  });
}

function toAnthropicSystem(content: string | ContentBlock[]): string | undefined {
  if (typeof content === "string") return content;
  const texts = content.filter((b) => b.type === "text").map((b) => b.text);
  return texts.join("\n") || undefined;
}
