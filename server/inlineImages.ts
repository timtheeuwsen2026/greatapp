/**
 * Turns inline base64 image payloads into stored files.
 *
 * Participant onboarding used to read the chosen avatar with FileReader and save
 * the whole `data:image/...;base64,...` string into the profile row. A single
 * phone photo is well over a megabyte of text, it rode along on every API
 * response carrying that participant, and it is not a URL any other part of the
 * app can treat like one. Clients now upload properly, but profiles saved
 * earlier — and any client still doing this — are repaired here on write.
 */

import { uploadImageToSupabase } from "./supabaseStorage";

const DATA_URL_PATTERN = /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

// Base64 costs ~4 characters per 3 bytes; refuse anything that would not have
// passed the 10MB limit on the normal upload route.
const MAX_DECODED_BYTES = 10 * 1024 * 1024;

export function isInlineImageData(value: unknown): value is string {
  return typeof value === "string" && DATA_URL_PATTERN.test(value.trim());
}

/**
 * Uploads an inline data URI and returns its public URL. Any other value is
 * returned untouched, so this is safe to call on every write.
 *
 * On upload failure the original value is returned rather than throwing — a
 * broken avatar must never cost someone their profile.
 */
export async function persistInlineImage(
  value: unknown,
  userId: string,
): Promise<unknown> {
  if (!isInlineImageData(value)) return value;

  const match = DATA_URL_PATTERN.exec(value.trim());
  if (!match) return value;

  const [, mimeType, , base64Payload] = match;

  try {
    const buffer = Buffer.from(base64Payload.replace(/\s/g, ""), "base64");
    if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
      console.warn(
        `[inlineImages] Refusing inline image for user ${userId}: ${buffer.length} bytes`,
      );
      return value;
    }

    const url = await uploadImageToSupabase(buffer, mimeType.toLowerCase(), userId);
    console.log(`[inlineImages] Stored inline avatar for user ${userId} as ${url}`);
    return url;
  } catch (error: any) {
    console.error(`[inlineImages] Could not store inline image for user ${userId}:`, error?.message);
    return value;
  }
}

/**
 * Applies persistInlineImage to the named fields of a payload.
 */
export async function persistInlineImageFields<T extends Record<string, any>>(
  payload: T,
  fields: Array<keyof T>,
  userId: string,
): Promise<T> {
  const out: Record<string, any> = { ...payload };
  for (const field of fields) {
    if (isInlineImageData(out[field as string])) {
      out[field as string] = await persistInlineImage(out[field as string], userId);
    }
  }
  return out as T;
}
