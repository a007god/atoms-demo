import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LLMMessage, LLMProvider, LLMStreamOptions } from "./types";

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  private readonly client: OpenAI;

  constructor(private readonly model: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL;
    if (!apiKey || !baseURL) {
      throw new Error(
        "OpenAIProvider requires OPENAI_API_KEY and OPENAI_BASE_URL (the proxy /v1 endpoint).",
      );
    }
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async *stream(
    messages: LLMMessage[],
    opts?: LLMStreamOptions,
  ): AsyncIterable<string> {
    const mapped: ChatCompletionMessageParam[] = messages.map((m) => {
      const content = typeof m.content === "string"
        ? m.content
        : m.content.map((b) =>
            b.type === "text"
              ? { type: "text" as const, text: b.text }
              : { type: "image_url" as const, image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
          );
      return { role: m.role, content } as ChatCompletionMessageParam;
    });

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: mapped,
        stream: true,
      },
      { signal: opts?.signal },
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
