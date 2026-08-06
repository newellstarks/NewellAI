import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openArtifactDb } from "../artifacts/db";
import { enqueueArtifact, getArtifactStatus } from "../artifacts/queue";
import {
  artifactBytesKind,
  authorizeArtifactEnqueue,
  authorizeCaptureEnqueue,
  authorizeLegacyEnqueue,
  ARTIFACT_ENQUEUE_TYPE,
  CAPTURE_ENQUEUE_TYPE,
  coerceArtifactBytes,
  describeArtifactBytesShape,
  isApprovedChatgptLocation,
  senderLocation,
  validateArtifactEnqueueMessage,
} from "./messaging";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const EXT = "abcdefghijklmnopqrstuvwxyzabcdef";

describe("senderLocation", () => {
  it("prefers tab.url, then url, then origin", () => {
    expect(
      senderLocation({
        tab: { url: "https://chatgpt.com/c/1" },
        url: "https://chat.openai.com/",
        origin: "https://chatgpt.com",
      }),
    ).toBe("https://chatgpt.com/c/1");
    expect(
      senderLocation({
        url: "https://chat.openai.com/c/2",
        origin: "https://chatgpt.com",
      }),
    ).toBe("https://chat.openai.com/c/2");
    expect(senderLocation({ origin: "https://chatgpt.com" })).toBe(
      "https://chatgpt.com",
    );
    expect(senderLocation({})).toBeUndefined();
  });
});

describe("isApprovedChatgptLocation", () => {
  it("accepts exact https ChatGPT origins", () => {
    expect(isApprovedChatgptLocation("https://chatgpt.com/c/abc")).toBe(true);
    expect(isApprovedChatgptLocation("https://chat.openai.com/")).toBe(true);
    expect(isApprovedChatgptLocation("https://chatgpt.com")).toBe(true);
  });

  it("rejects deceptive domains, http, and other https origins", () => {
    expect(isApprovedChatgptLocation("https://chatgpt.com.evil.example/")).toBe(
      false,
    );
    expect(isApprovedChatgptLocation("https://evil-chatgpt.com/")).toBe(false);
    expect(isApprovedChatgptLocation("http://chatgpt.com/c/abc")).toBe(false);
    expect(isApprovedChatgptLocation("https://example.com/")).toBe(false);
    expect(isApprovedChatgptLocation(undefined)).toBe(false);
  });
});

describe("authorizeCaptureEnqueue location fields", () => {
  const good = {
    type: CAPTURE_ENQUEUE_TYPE,
    conversation_id: "conv-1",
    source_key: "msg-1",
    speaker: "user" as const,
    text: "hello",
  };

  it("accepts sender.tab.url, sender.url, and sender.origin", () => {
    expect(
      authorizeCaptureEnqueue(
        good,
        { id: EXT, tab: { url: "https://chatgpt.com/c/1" } },
        EXT,
      ).ok,
    ).toBe(true);
    expect(
      authorizeCaptureEnqueue(
        good,
        { id: EXT, url: "https://chat.openai.com/c/2" },
        EXT,
      ).ok,
    ).toBe(true);
    expect(
      authorizeCaptureEnqueue(good, { id: EXT, origin: "https://chatgpt.com" }, EXT)
        .ok,
    ).toBe(true);
  });

  it("rejects missing location and deceptive domains", () => {
    expect(authorizeCaptureEnqueue(good, { id: EXT }, EXT).ok).toBe(false);
    expect(
      authorizeCaptureEnqueue(
        good,
        { id: EXT, url: "https://chatgpt.com.evil.example/" },
        EXT,
      ).ok,
    ).toBe(false);
    expect(
      authorizeCaptureEnqueue(
        good,
        { id: EXT, origin: "https://evil-chatgpt.com" },
        EXT,
      ).ok,
    ).toBe(false);
    expect(
      authorizeCaptureEnqueue(good, { id: EXT, url: "http://chatgpt.com/" }, EXT)
        .ok,
    ).toBe(false);
  });
});

describe("authorizeLegacyEnqueue", () => {
  it("allows extension options/background context", () => {
    expect(
      authorizeLegacyEnqueue(
        { id: EXT, url: `chrome-extension://${EXT}/options.html` },
        EXT,
      ),
    ).toEqual({ ok: true });
    expect(authorizeLegacyEnqueue({ id: EXT }, EXT)).toEqual({ ok: true });
  });

  it("rejects ChatGPT tab sender", () => {
    expect(
      authorizeLegacyEnqueue(
        {
          id: EXT,
          tab: { url: "https://chatgpt.com/c/1" },
          url: "https://chatgpt.com/c/1",
        },
        EXT,
      ).ok,
    ).toBe(false);
  });

  it("rejects arbitrary web-tab sender", () => {
    expect(
      authorizeLegacyEnqueue(
        { id: EXT, tab: { url: "https://example.com/" } },
        EXT,
      ).ok,
    ).toBe(false);
  });

  it("rejects wrong extension id", () => {
    expect(
      authorizeLegacyEnqueue(
        { id: "other", url: `chrome-extension://${EXT}/options.html` },
        EXT,
      ).ok,
    ).toBe(false);
  });

  it("rejects non-extension url even without tab", () => {
    expect(
      authorizeLegacyEnqueue({ id: EXT, url: "https://evil.example/" }, EXT).ok,
    ).toBe(false);
  });
});

describe("capture Off cannot be bypassed via captureEnqueue authorization alone", () => {
  // Enabled check lives in background after authorizeCaptureEnqueue; this
  // documents that legacy enqueue from a ChatGPT tab is rejected before queue.
  it("ChatGPT content-script cannot use legacy enqueue", () => {
    const result = authorizeLegacyEnqueue(
      {
        id: EXT,
        tab: { url: "https://chatgpt.com/c/1" },
      },
      EXT,
    );
    expect(result).toEqual({ ok: false, reason: "tab_context" });
  });
});

describe("authorizeArtifactEnqueue", () => {
  const base = {
    type: ARTIFACT_ENQUEUE_TYPE,
    conversation_id: "conv1",
    client_turn_id: "turn1",
    source_key: "file_abc",
    direction: "user_uploaded",
    mime_type: "image/png",
    declared_sha256: "a".repeat(64),
    declared_byte_size: 4,
    bytes: new Uint8Array([1, 2, 3, 4]).buffer,
  };

  it("accepts ChatGPT content-script artifact enqueue", () => {
    const result = authorizeArtifactEnqueue(
      base,
      { id: EXT, tab: { url: "https://chatgpt.com/c/1" } },
      EXT,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects bad mime and wrong origin", () => {
    expect(
      authorizeArtifactEnqueue(
        { ...base, mime_type: "application/pdf" },
        { id: EXT, tab: { url: "https://chatgpt.com/c/1" } },
        EXT,
      ).ok,
    ).toBe(false);
    expect(
      authorizeArtifactEnqueue(
        base,
        { id: EXT, tab: { url: "https://example.com/" } },
        EXT,
      ).ok,
    ).toBe(false);
  });
});

describe("artifactEnqueue bytes wire format", () => {
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  /** Simulate Chrome sendMessage destroying TypedArray into a plain object. */
  function asPlainArrayLike(bytes: Uint8Array): Record<string, number> {
    const obj: Record<string, number> = { length: bytes.length };
    for (let i = 0; i < bytes.length; i++) obj[i] = bytes[i]!;
    return obj;
  }

  async function messageFor(
    bytes: ArrayBuffer | Uint8Array | number[] | Record<string, number>,
    overrides: Record<string, unknown> = {},
  ) {
    let view: Uint8Array;
    if (bytes instanceof ArrayBuffer) {
      view = new Uint8Array(bytes);
    } else if (bytes instanceof Uint8Array) {
      view = bytes;
    } else if (Array.isArray(bytes)) {
      view = Uint8Array.from(bytes);
    } else {
      const len = bytes.length;
      view = new Uint8Array(len);
      for (let i = 0; i < len; i++) view[i] = bytes[i]!;
    }
    const buf = new Uint8Array(view.byteLength);
    buf.set(view);
    const sha = await sha256Hex(buf.buffer);
    return {
      type: ARTIFACT_ENQUEUE_TYPE,
      conversation_id: "conv1",
      client_turn_id: "turn1",
      source_key: "file_png_small",
      direction: "user_uploaded" as const,
      mime_type: "image/png",
      declared_sha256: sha,
      declared_byte_size: buf.byteLength,
      bytes,
      ...overrides,
    };
  }

  it("coerceArtifactBytes accepts ArrayBuffer, Uint8Array, and number[]", () => {
    const ab = new Uint8Array(pngHeader).buffer;
    expect(coerceArtifactBytes(ab)?.byteLength).toBe(8);
    expect(coerceArtifactBytes(pngHeader)?.byteLength).toBe(8);
    expect(coerceArtifactBytes(Array.from(pngHeader))?.byteLength).toBe(8);
    expect(coerceArtifactBytes("nope")).toBeNull();
    expect(artifactBytesKind(pngHeader)).toBe("Uint8Array");
    expect(artifactBytesKind(ab)).toBe("ArrayBuffer");
    expect(artifactBytesKind([1, 2])).toBe("array");
  });

  it("accepts preferred number[] wire format (small PNG)", async () => {
    const msg = await messageFor(Array.from(pngHeader));
    const result = validateArtifactEnqueueMessage(msg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.bytes).toBeInstanceOf(ArrayBuffer);
      expect(result.message.bytes!.byteLength).toBe(8);
      expect(result.message.mime_type).toBe("image/png");
      expect(result.message.declared_sha256).toBe(msg.declared_sha256);
    }
  });

  it("accepts live Chrome plain-object array-like serialization", async () => {
    const plain = asPlainArrayLike(pngHeader);
    const shape = describeArtifactBytesShape(plain);
    expect(shape.isArray).toBe(false);
    expect(shape.isView).toBe(false);
    expect(shape.ctorName).toBe("Object");
    expect(shape.hasLength).toBe(true);
    expect(shape.numericKeyCount).toBeGreaterThan(0);

    const msg = await messageFor(plain);
    const result = validateArtifactEnqueueMessage(msg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.bytes!.byteLength).toBe(8);
      expect(new Uint8Array(result.message.bytes!)[0]).toBe(0x89);
    }
  });

  it("accepts ~2MB number[] payload and preserves length/checksum", async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    const msg = await messageFor(Array.from(big), {
      source_key: "file_png_2mb",
    });
    const result = validateArtifactEnqueueMessage(msg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.bytes!.byteLength).toBe(2 * 1024 * 1024);
      expect(result.message.declared_sha256).toBe(msg.declared_sha256);
      expect(result.message.mime_type).toBe("image/png");
    }
  });

  it("rejects invalid bytes shapes", async () => {
    const good = await messageFor(Array.from(pngHeader));
    expect(
      validateArtifactEnqueueMessage({ ...good, bytes: "not-binary" }).ok,
    ).toBe(false);
    expect(validateArtifactEnqueueMessage({ ...good, bytes: {} }).ok).toBe(
      false,
    );
    expect(
      validateArtifactEnqueueMessage({
        ...good,
        declared_byte_size: 99,
        bytes: Array.from(pngHeader),
      }).ok,
    ).toBe(false);
    expect(
      validateArtifactEnqueueMessage({
        ...good,
        declared_byte_size: 3,
        bytes: [1, 2, 256],
      }).ok,
    ).toBe(false);
    expect(
      validateArtifactEnqueueMessage({
        ...good,
        declared_byte_size: 3,
        bytes: [1, 2, 1.5],
      }).ok,
    ).toBe(false);
    const rejected = validateArtifactEnqueueMessage({
      ...good,
      bytes: [1, 2, 3],
    });
    expect(rejected).toEqual({ ok: false, reason: "bytes" });
  });

  it("authorize + enqueueArtifact acknowledges number[] bridge payload", async () => {
    const db = await openArtifactDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ["queue", "dead", "conflicts", "identities", "status"],
        "readwrite",
      );
      for (const name of [
        "queue",
        "dead",
        "conflicts",
        "identities",
        "status",
      ]) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const msg = await messageFor(Array.from(pngHeader), {
      source_key: "file_bridge_ack",
    });
    const gate = authorizeArtifactEnqueue(
      msg,
      { id: EXT, tab: { url: "https://chatgpt.com/c/1" } },
      EXT,
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;

    const result = await enqueueArtifact(db, {
      conversation_id: gate.message.conversation_id,
      user_id: "user-1",
      client_turn_id: gate.message.client_turn_id,
      source_key: gate.message.source_key,
      direction: gate.message.direction,
      mime_type: gate.message.mime_type,
      declared_sha256: gate.message.declared_sha256,
      declared_byte_size: gate.message.declared_byte_size,
      capture: { capture_client: "chrome-extension" },
      bytes: gate.message.bytes,
    });
    expect(result.status).toBe("accepted");
    const status = await getArtifactStatus(db);
    expect(status.pending).toBe(1);
  });
});
