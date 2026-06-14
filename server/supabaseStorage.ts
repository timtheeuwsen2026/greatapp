import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const BUCKET = "uploads";

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function uploadToSupabase(buffer: Buffer, mimeType: string, filePath: string): Promise<string> {
  const supabase = getStorageClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadImageToSupabase(
  buffer: Buffer,
  mimeType: string,
  userId: string
): Promise<string> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return uploadToSupabase(buffer, mimeType, `${userId}/images/${randomUUID()}.${ext}`);
}

export async function uploadDocumentToSupabase(
  buffer: Buffer,
  mimeType: string,
  userId: string
): Promise<string> {
  const extMap: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  const ext = extMap[mimeType] ?? "bin";
  return uploadToSupabase(buffer, mimeType, `${userId}/documents/${randomUUID()}.${ext}`);
}
