import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateImage } from "@/lib/llm/image";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }

  try {
    const result = await generateImage(parsed.data.prompt, {
      size: parsed.data.size,
      signal: req.signal,
    });

    return Response.json({
      url: `data:image/png;base64,${result.b64}`,
      revisedPrompt: result.revisedPrompt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
