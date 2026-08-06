import { describe, expect, it } from "vitest";
import {
  ARTIFACT_MIN_IMAGE_BYTES,
  detectImageMimeFromBytes,
  validateEstuaryContentUrl,
  validateImagePayload,
} from "./allowlist";

describe("estuary download allowlist", () => {
  it("accepts chatgpt.com estuary content URLs with id (signed params optional)", () => {
    const full =
      "https://chatgpt.com/backend-api/estuary/content?id=file_abc&ts=1&p=2&cid=3&sig=4&v=5";
    const min =
      "https://chatgpt.com/backend-api/estuary/content?id=file_abc";
    const trailing =
      "https://chatgpt.com/backend-api/estuary/content/?id=file_abc&ts=1";
    for (const raw of [full, min, trailing]) {
      const result = validateEstuaryContentUrl(raw);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.fileId).toBe("file_abc");
    }
  });

  it("rejects blob, other hosts, wrong path, missing id", () => {
    expect(validateEstuaryContentUrl("blob:https://chatgpt.com/x").ok).toBe(
      false,
    );
    expect(
      validateEstuaryContentUrl(
        "https://files.oaiusercontent.com/file?id=1&ts=1&p=2&cid=3&sig=4&v=5",
      ).ok,
    ).toBe(false);
    expect(
      validateEstuaryContentUrl(
        "https://chatgpt.com/backend-api/other?id=1&ts=1&p=2&cid=3&sig=4&v=5",
      ).ok,
    ).toBe(false);
    expect(
      validateEstuaryContentUrl(
        "https://chatgpt.com/backend-api/estuary/content?ts=1&p=2&cid=3&sig=4&v=5",
      ).ok,
    ).toBe(false);
  });
});

function paddedImage(
  sig: number[],
  mimePad: "png" | "jpeg" | "webp",
  size = ARTIFACT_MIN_IMAGE_BYTES + 32,
): Uint8Array {
  const buf = new Uint8Array(size);
  buf.set(sig, 0);
  if (mimePad === "webp") {
    buf.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    buf.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  }
  return buf;
}

describe("image binary signature validation", () => {
  it("detects PNG/JPEG/WebP magic", () => {
    expect(
      detectImageMimeFromBytes(
        paddedImage([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "png"),
      ),
    ).toBe("image/png");
    expect(
      detectImageMimeFromBytes(paddedImage([0xff, 0xd8, 0xff, 0xe0], "jpeg")),
    ).toBe("image/jpeg");
    expect(detectImageMimeFromBytes(paddedImage([], "webp"))).toBe(
      "image/webp",
    );
    expect(detectImageMimeFromBytes(new TextEncoder().encode('{"a":1}'))).toBe(
      null,
    );
  });

  it("accepts valid sized PNG payload with matching MIME", () => {
    const png = paddedImage(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      "png",
    );
    const result = validateImagePayload(png, "image/png");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe("image/png");
  });

  it("rejects tiny invalid / placeholder payloads", () => {
    const tiny = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa1, 0x46, 0x9f, 0x31, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    expect(tiny.byteLength).toBe(69);
    expect(validateImagePayload(tiny, "image/png")).toEqual({
      ok: false,
      reason: "too_small",
    });
  });

  it("rejects JSON/text bodies even when Content-Type claims image/png", () => {
    const json = new TextEncoder().encode(
      JSON.stringify({ error: "not_an_image", detail: "x".repeat(120) }),
    );
    expect(json.byteLength).toBeGreaterThan(ARTIFACT_MIN_IMAGE_BYTES);
    expect(validateImagePayload(json, "image/png")).toEqual({
      ok: false,
      reason: "not_image",
    });
  });

  it("rejects MIME/signature mismatch", () => {
    const jpeg = paddedImage([0xff, 0xd8, 0xff, 0xe0], "jpeg");
    expect(validateImagePayload(jpeg, "image/png")).toEqual({
      ok: false,
      reason: "mime_mismatch",
    });
  });
});
