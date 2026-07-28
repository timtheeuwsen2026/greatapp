import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// QA V13 Bug 4.2: the participant avatar was stored as a base64 data URI, so it
// was not a URL anything else could use and it added ~2MB to every response
// carrying that participant.

const uploadImageToSupabase = vi.fn();
vi.mock("../supabaseStorage", () => ({
  uploadImageToSupabase: (...args: any[]) => uploadImageToSupabase(...args),
}));

const { isInlineImageData, persistInlineImage, persistInlineImageFields } = await import("../inlineImages");

// 1x1 transparent PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_DATA_URI = `data:image/png;base64,${PNG_BASE64}`;

describe("inline image handling", () => {
  beforeEach(() => {
    uploadImageToSupabase.mockReset();
    uploadImageToSupabase.mockResolvedValue("https://storage.test/u1/images/abc.png");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recognises base64 image payloads and leaves real URLs alone", () => {
    expect(isInlineImageData(PNG_DATA_URI)).toBe(true);
    expect(isInlineImageData("https://storage.test/u1/images/abc.png")).toBe(false);
    expect(isInlineImageData("")).toBe(false);
    expect(isInlineImageData(null)).toBe(false);
    expect(isInlineImageData("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
  });

  it("uploads an inline avatar and returns the stored URL", async () => {
    const result = await persistInlineImage(PNG_DATA_URI, "user-1");

    expect(result).toBe("https://storage.test/u1/images/abc.png");
    const [buffer, mimeType, userId] = uploadImageToSupabase.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mimeType).toBe("image/png");
    expect(userId).toBe("user-1");
  });

  it("passes through values that are already URLs without uploading", async () => {
    const url = "https://storage.test/existing.jpg";
    expect(await persistInlineImage(url, "user-1")).toBe(url);
    expect(uploadImageToSupabase).not.toHaveBeenCalled();
  });

  it("keeps the original value when the upload fails, rather than losing the profile", async () => {
    uploadImageToSupabase.mockRejectedValue(new Error("storage down"));

    expect(await persistInlineImage(PNG_DATA_URI, "user-1")).toBe(PNG_DATA_URI);
  });

  it("only rewrites the named fields of a payload", async () => {
    const result = await persistInlineImageFields(
      { avatarUrl: PNG_DATA_URI, displayName: "Tim", bio: "data:image/png;base64,notafield" },
      ["avatarUrl"],
      "user-1",
    );

    expect(result.avatarUrl).toBe("https://storage.test/u1/images/abc.png");
    expect(result.displayName).toBe("Tim");
    expect(result.bio).toBe("data:image/png;base64,notafield");
    expect(uploadImageToSupabase).toHaveBeenCalledTimes(1);
  });
});
