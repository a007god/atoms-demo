import type { LLMMessage, LLMProvider, LLMStreamOptions } from "./types";

export class MockProvider implements LLMProvider {
  readonly id = "mock";

  constructor(private readonly delayMs = 18) {}

  async *stream(
    messages: LLMMessage[],
    opts?: LLMStreamOptions,
  ): AsyncIterable<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const rawContent = lastUser?.content ?? "(空消息)";
    const userText = typeof rawContent === "string"
      ? rawContent
      : rawContent.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "(图片)";

    const reply =
      `（Mock 回复）收到："${userText}"。\n\n` +
      `这是一段离线模拟的流式输出，每 ${this.delayMs} ms 吐一个字符，用来验证 SSE 管线打通。\n\n` +
      `准备好真实的 API key 之后，把 .env.local 里 DEFAULT_PROVIDER 改成 openai 或 anthropic 就走真实模型。`;

    for (const ch of reply) {
      if (opts?.signal?.aborted) return;
      await sleep(this.delayMs, opts?.signal);
      yield ch;
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
