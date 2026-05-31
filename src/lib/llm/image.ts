import type { LLMMessage } from "./types";

const IMAGE_MODEL = "gpt-image-2";

export type GeneratedImage = {
  b64: string;
  revisedPrompt?: string;
};

export async function generateImage(
  prompt: string,
  opts?: { size?: string; signal?: AbortSignal },
): Promise<GeneratedImage> {
  const maxRetries = 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await doGenerate(prompt, opts);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  throw lastError;
}

async function doGenerate(
  prompt: string,
  opts?: { size?: string; signal?: AbortSignal },
): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://mynewapi.n1neman.fun/v1";

  const timeout = AbortSignal.timeout(30_000);
  const signals = opts?.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;

  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: opts?.size || "1024x1024",
      response_format: "b64_json",
    }),
    signal: signals,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const data = json.data?.[0];
  if (!data?.b64_json) {
    throw new Error("No image data in response");
  }

  return {
    b64: data.b64_json,
    revisedPrompt: data.revised_prompt,
  };
}
