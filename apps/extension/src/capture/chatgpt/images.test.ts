import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import {
  discoverEstuaryImagesInElement,
  fetchEstuaryImageBytes,
  imageSearchRoot,
  probeArtifactDiscovery,
  turnHasImageAttachment,
} from "./images";
import {
  FIXTURE_USER_UPLOAD_ESTUARY_IN_ROLE_MIN_QUERY,
  FIXTURE_USER_UPLOAD_IMAGE_ESTUARY_SRC,
  FIXTURE_USER_UPLOAD_IMAGE_SIBLING,
  FIXTURE_USER_UPLOAD_SECTION_DATA_TURN_SIBLING,
} from "./fixtures";
import {
  extractRawMessages,
  selectCompletedCandidates,
} from "./adapter";
import type { StabilityTracker } from "./completion";

function loadFixture(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

describe("discoverEstuaryImagesInElement", () => {
  it("finds estuary img src and ignores bare blob", () => {
    const document = loadFixture(`
      <div id="root">
        <img src="blob:https://chatgpt.com/uuid" />
        <img src="https://chatgpt.com/backend-api/estuary/content?id=file_1&ts=1&p=2&cid=3&sig=4&v=5" />
      </div>
    `);
    const root = document.querySelector("#root")!;
    const found = discoverEstuaryImagesInElement(
      root,
      "user_uploaded",
      "turn-1",
      "turn-1",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.source_url).toContain("file_1");
  });

  it("resolves blob preview wrapped by estuary anchor under turn sibling", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_IMAGE_SIBLING);
    const role = document.querySelector("[data-message-author-role='user']");
    expect(role).toBeTruthy();
    const root = imageSearchRoot(role!);
    expect(root.getAttribute("data-testid")).toBe("conversation-turn-uploaded");
    expect(turnHasImageAttachment(role!)).toBe(true);

    const found = discoverEstuaryImagesInElement(
      role!,
      "user_uploaded",
      "turn-1",
      "turn-1",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.source_url).toContain("file_upload_live");
    expect(found[0]!.image_provenance).toBe("uploaded");
  });

  it("finds estuary img src sibling of role node with caption", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_IMAGE_ESTUARY_SRC);
    const role = document.querySelector("[data-message-author-role='user']");
    const found = discoverEstuaryImagesInElement(
      role!,
      "user_uploaded",
      "turn-1",
      "turn-1",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.source_url).toContain("file_direct");
  });

  it("live role-scoped estuary img with id-only query is discovered", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_ESTUARY_IN_ROLE_MIN_QUERY);
    const role = document.querySelector("[data-message-author-role='user']");
    expect(role).toBeTruthy();
    expect(turnHasImageAttachment(role!)).toBe(true);
    const found = discoverEstuaryImagesInElement(
      role!,
      "user_uploaded",
      "turn-live",
      "turn-live",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.source_url).toContain("file_live_min_only");
    expect(found[0]!.source_url).toContain("/backend-api/estuary/content");
  });

  it("discovers sibling estuary anchor under section[data-turn] without turn testid", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_SECTION_DATA_TURN_SIBLING);
    const role = document.querySelector("[data-message-author-role='user']");
    expect(role).toBeTruthy();
    const root = imageSearchRoot(role!);
    expect(root.tagName).toBe("SECTION");
    expect(root.getAttribute("data-turn")).toBe("user");
    expect(turnHasImageAttachment(role!)).toBe(true);

    const probe = probeArtifactDiscovery(role!);
    expect(probe.has_turn_root).toBe(true);
    expect(probe.root_kind).toBe("turn");
    expect(probe.blob_img_count).toBe(1);
    expect(probe.accepted).toBe(1);

    const found = discoverEstuaryImagesInElement(
      role!,
      "user_uploaded",
      "turn-section",
      "turn-section",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.source_url).toContain("file_section_turn");
  });
});

describe("image-only user turn completion", () => {
  it("completes empty-text user turn when sibling image attachment present", () => {
    const document = loadFixture(FIXTURE_USER_UPLOAD_IMAGE_SIBLING);
    const raw = extractRawMessages(document);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.text).toBe("");
    const tracker: StabilityTracker = new Map();
    const completed = selectCompletedCandidates(raw, tracker, Date.now(), 800);
    expect(completed).toHaveLength(1);
    expect(completed[0]!.text).toBe("[image attachment]");
    expect(completed[0]!.element).toBeTruthy();
  });
});

const ESTUARY =
  "https://chatgpt.com/backend-api/estuary/content?id=file_z&ts=1&p=2&cid=3&sig=4&v=5";

function makePngBody(size = 256): Uint8Array {
  const png = new Uint8Array(size);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return png;
}

function bodyOf(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

describe("fetchEstuaryImageBytes", () => {
  it("fetches estuary content with credentials and validates mime/signature/size", async () => {
    const png = makePngBody(512);
    const fetchFn = vi.fn(async () => {
      return new Response(bodyOf(png), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-disposition": 'inline; filename="a.png"',
          "content-length": String(png.byteLength),
        },
      });
    });
    const result = await fetchEstuaryImageBytes(
      ESTUARY,
      fetchFn as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.mime_type).toBe("image/png");
      expect(result.artifact.original_filename).toBe("a.png");
      expect(result.artifact.file_id).toBe("file_z");
      expect(result.artifact.byte_size).toBe(512);
      expect(new Uint8Array(result.artifact.bytes).slice(0, 8)).toEqual(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      );
    }
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("/backend-api/estuary/content"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects 200 JSON/text body claimed as image/png", async () => {
    const body = JSON.stringify({
      detail: "signed url metadata only",
      padding: "x".repeat(100),
    });
    const fetchFn = vi.fn(async () => {
      return new Response(body, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    const result = await fetchEstuaryImageBytes(
      ESTUARY,
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, reason: "not_image" });
  });

  it("rejects tiny invalid PNG payloads", async () => {
    const tiny = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa1, 0x46, 0x9f, 0x31, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const fetchFn = vi.fn(async () => {
      return new Response(bodyOf(tiny), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    const result = await fetchEstuaryImageBytes(
      ESTUARY,
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, reason: "too_small" });
  });

  it("accepts JPEG and WebP signatures with matching Content-Type", async () => {
    const jpeg = new Uint8Array(200);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0);
    const webp = new Uint8Array(200);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);

    for (const [bytes, mime] of [
      [jpeg, "image/jpeg"],
      [webp, "image/webp"],
    ] as const) {
      const fetchFn = vi.fn(async () => {
        return new Response(bodyOf(bytes), {
          status: 200,
          headers: { "content-type": mime },
        });
      });
      const result = await fetchEstuaryImageBytes(
        ESTUARY,
        fetchFn as unknown as typeof fetch,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.artifact.mime_type).toBe(mime);
    }
  });
});
