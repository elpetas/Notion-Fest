/**
 * Generates a festival promo image via OpenAI Image API (GPT Image or DALL·E).
 */

import { cacheGeneratedImage, publicImageUrl } from "@/lib/content/image-cache";

function isGptImageModel(model: string): boolean {
  return model.startsWith("gpt-image");
}

function modelNotFound(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("does not exist") || lower.includes("model_not_found");
}

function resolveModelCandidates(): string[] {
  const fromEnv = process.env.OPENAI_IMAGE_MODEL?.trim();
  const defaults = ["gpt-image-1.5", "gpt-image-1", "dall-e-2"];
  const list = fromEnv ? [fromEnv, ...defaults.filter((m) => m !== fromEnv)] : defaults;
  return [...new Set(list)];
}

function buildRequestBody(model: string, prompt: string): Record<string, unknown> {
  const trimmed = prompt.slice(0, isGptImageModel(model) ? 32000 : 1000);
  const body: Record<string, unknown> = {
    model,
    prompt: trimmed,
    n: 1,
  };

  if (isGptImageModel(model)) {
    body.size = "1024x1024";
  } else if (model === "dall-e-3") {
    body.size = "1024x1024";
  } else {
    body.size = "1024x1024";
  }

  return body;
}

async function requestImage(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{
  ok: boolean;
  item?: { url?: string; b64_json?: string };
  error?: string;
}> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildRequestBody(model, prompt)),
  });

  const data = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return { ok: false, error: data.error?.message ?? `OpenAI image error ${res.status}` };
  }

  const item = data.data?.[0];
  if (!item?.b64_json && !item?.url) {
    return { ok: false, error: "OpenAI returned no image data" };
  }

  return { ok: true, item };
}

async function cacheFromItem(
  item: { url?: string; b64_json?: string },
  origin: string,
): Promise<{ imageUrl: string | null; imageId: string | null; warning?: string }> {
  let buffer: Buffer | null = null;

  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    try {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) {
        return {
          imageUrl: item.url,
          imageId: null,
          warning: "Using temporary OpenAI image URL (could not cache locally)",
        };
      }
      buffer = Buffer.from(await imgRes.arrayBuffer());
    } catch {
      return {
        imageUrl: item.url,
        imageId: null,
        warning: "Using temporary OpenAI image URL (expires in ~1 hour)",
      };
    }
  }

  if (!buffer) {
    return { imageUrl: null, imageId: null, warning: "OpenAI returned no image data" };
  }

  const imageId = cacheGeneratedImage(buffer, "image/png");
  return {
    imageUrl: publicImageUrl(origin, imageId),
    imageId,
  };
}

export async function generateFestivalImage(
  prompt: string,
  origin: string,
): Promise<{ imageUrl: string | null; imageId: string | null; warning?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      imageUrl: null,
      imageId: null,
      warning: "OPENAI_API_KEY not set — image skipped (caption and prompt still generated)",
    };
  }

  const models = resolveModelCandidates();
  let lastError = "No image models available";

  for (const model of models) {
    const result = await requestImage(apiKey, model, prompt);
    if (result.ok && result.item) {
      const cached = await cacheFromItem(result.item, origin);
      return cached;
    }

    lastError = result.error ?? lastError;
    if (!modelNotFound(lastError)) {
      break;
    }
  }

  return {
    imageUrl: null,
    imageId: null,
    warning: `${lastError} — set OPENAI_IMAGE_MODEL in .env (e.g. gpt-image-1.5) to a model your key supports.`,
  };
}
