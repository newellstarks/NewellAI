// @ts-nocheck — happy-dom Document/Event types vs Workers lib
import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadThumbnail,
  showThumbnailUnavailable,
} from "../../public/recall/thumbnail.js";

function pngBlob(): Blob {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  return new Blob([bytes], { type: "image/png" });
}

describe("Recall loadThumbnail", () => {
  let window: Window;
  let document: Document;
  const liveUrls = new Set<string>();

  afterEach(() => {
    liveUrls.clear();
    window?.happyDOM.close();
  });

  function setup() {
    window = new Window({ url: "http://127.0.0.1:8787/recall/" });
    document = window.document as unknown as Document;
    const trackObjectUrl = (url: string) => {
      liveUrls.add(url);
      return url;
    };
    const revokeObjectUrl = (url: string) => {
      liveUrls.delete(url);
      if (url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
    return { trackObjectUrl, revokeObjectUrl };
  }

  function mountThumb(): HTMLImageElement {
    const img = document.createElement("img");
    img.className = "artifact-thumb";
    img.alt = "Captured image";
    img.hidden = true;
    document.body.appendChild(img);
    return img;
  }

  it("reveals image after successful 200 blob fetch and load", async () => {
    const { trackObjectUrl, revokeObjectUrl } = setup();
    const img = mountThumb();
    const blob = pngBlob();
    const objectUrl = "blob:http://127.0.0.1:8787/thumb-ok";

    const fetchBlob = vi.fn(async () => blob);
    const createObjectURL = vi.fn(() => objectUrl);

    // happy-dom may not decode PNG; simulate successful load after src assign.
    const origDesc = Object.getOwnPropertyDescriptor(
      window.HTMLImageElement.prototype,
      "src",
    );
    Object.defineProperty(img, "src", {
      configurable: true,
      set(v: string) {
        origDesc?.set?.call(img, v);
        Object.defineProperty(img, "complete", { configurable: true, get: () => true });
        Object.defineProperty(img, "naturalWidth", {
          configurable: true,
          get: () => 32,
        });
        Object.defineProperty(img, "naturalHeight", {
          configurable: true,
          get: () => 32,
        });
        queueMicrotask(() => img.dispatchEvent(new window.Event("load")));
      },
      get() {
        return origDesc?.get?.call(img) ?? "";
      },
    });

    await loadThumbnail(img, "art-ok", {
      fetchBlob,
      trackObjectUrl,
      revokeObjectUrl,
      createObjectURL,
    });

    expect(fetchBlob).toHaveBeenCalledWith("art-ok");
    expect(img.hidden).toBe(false);
    expect(img.getAttribute("hidden")).toBeNull();
    expect(img.src).toContain("blob:");
    expect(liveUrls.has(objectUrl)).toBe(true);
    expect(document.body.textContent).not.toContain("Thumbnail unavailable");
  });

  it("revokes object URL and exits cleanly when disconnected after fetch", async () => {
    const { trackObjectUrl, revokeObjectUrl } = setup();
    const img = mountThumb();
    const objectUrl = "blob:http://127.0.0.1:8787/thumb-gone";
    const createObjectURL = vi.fn(() => objectUrl);

    const fetchBlob = vi.fn(async () => {
      // Simulate navigation/rerender removing the node during fetch.
      img.remove();
      return pngBlob();
    });

    await loadThumbnail(img, "art-disconnect", {
      fetchBlob,
      trackObjectUrl,
      revokeObjectUrl,
      createObjectURL,
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(liveUrls.size).toBe(0);
    expect(img.hidden).toBe(true);
    expect(document.body.querySelector(".artifact-status")).toBeNull();
  });

  it("revokes object URL when disconnected after src assign (mid-decode)", async () => {
    const { trackObjectUrl, revokeObjectUrl } = setup();
    const img = mountThumb();
    const objectUrl = "blob:http://127.0.0.1:8787/thumb-mid";
    const createObjectURL = vi.fn(() => objectUrl);

    const origDesc = Object.getOwnPropertyDescriptor(
      window.HTMLImageElement.prototype,
      "src",
    );
    Object.defineProperty(img, "src", {
      configurable: true,
      set(v: string) {
        origDesc?.set?.call(img, v);
        Object.defineProperty(img, "complete", {
          configurable: true,
          get: () => false,
        });
        // Remove during in-flight decode; poll should clean up.
        queueMicrotask(() => img.remove());
      },
      get() {
        return origDesc?.get?.call(img) ?? "";
      },
    });

    await loadThumbnail(img, "art-mid", {
      fetchBlob: async () => pngBlob(),
      trackObjectUrl,
      revokeObjectUrl,
      createObjectURL,
    });

    expect(liveUrls.size).toBe(0);
    expect(document.body.querySelector(".artifact-status")).toBeNull();
  });

  it("shows Thumbnail unavailable on image onerror and revokes URL", async () => {
    const { trackObjectUrl, revokeObjectUrl } = setup();
    const img = mountThumb();
    const objectUrl = "blob:http://127.0.0.1:8787/thumb-bad";
    const createObjectURL = vi.fn(() => objectUrl);

    const origDesc = Object.getOwnPropertyDescriptor(
      window.HTMLImageElement.prototype,
      "src",
    );
    Object.defineProperty(img, "src", {
      configurable: true,
      set(v: string) {
        origDesc?.set?.call(img, v);
        Object.defineProperty(img, "complete", { configurable: true, get: () => true });
        Object.defineProperty(img, "naturalWidth", {
          configurable: true,
          get: () => 0,
        });
        queueMicrotask(() => img.dispatchEvent(new window.Event("error")));
      },
      get() {
        return origDesc?.get?.call(img) ?? "";
      },
    });

    await loadThumbnail(img, "art-bad", {
      fetchBlob: async () => pngBlob(),
      trackObjectUrl,
      revokeObjectUrl,
      createObjectURL,
    });

    expect(liveUrls.has(objectUrl)).toBe(false);
    expect(document.body.textContent).toContain("Thumbnail unavailable");
    expect(document.body.querySelector("img.artifact-thumb")).toBeNull();
  });

  it("shows Thumbnail unavailable on 409 integrity failure", async () => {
    const { trackObjectUrl, revokeObjectUrl } = setup();
    const img = mountThumb();

    await loadThumbnail(img, "art-missing", {
      fetchBlob: async () => {
        throw Object.assign(new Error("Artifact metadata is stored but object bytes are missing"), {
          code: "HTTP",
        });
      },
      trackObjectUrl,
      revokeObjectUrl,
    });

    expect(liveUrls.size).toBe(0);
    expect(document.body.textContent).toContain("Thumbnail unavailable");
  });

  it("allows a fresh node to retry after a prior disconnect", async () => {
    const { trackObjectUrl, revokeObjectUrl } = setup();
    const first = mountThumb();
    const objectUrl = "blob:http://127.0.0.1:8787/thumb-retry";

    await loadThumbnail(first, "art-retry", {
      fetchBlob: async () => {
        first.remove();
        return pngBlob();
      },
      trackObjectUrl,
      revokeObjectUrl,
      createObjectURL: () => objectUrl,
    });
    expect(liveUrls.size).toBe(0);

    const second = mountThumb();
    const origDesc = Object.getOwnPropertyDescriptor(
      window.HTMLImageElement.prototype,
      "src",
    );
    Object.defineProperty(second, "src", {
      configurable: true,
      set(v: string) {
        origDesc?.set?.call(second, v);
        Object.defineProperty(second, "complete", {
          configurable: true,
          get: () => true,
        });
        Object.defineProperty(second, "naturalWidth", {
          configurable: true,
          get: () => 16,
        });
        queueMicrotask(() => second.dispatchEvent(new window.Event("load")));
      },
      get() {
        return origDesc?.get?.call(second) ?? "";
      },
    });

    await loadThumbnail(second, "art-retry", {
      fetchBlob: async () => pngBlob(),
      trackObjectUrl,
      revokeObjectUrl,
      createObjectURL: () => objectUrl,
    });

    expect(second.hidden).toBe(false);
    expect(liveUrls.has(objectUrl)).toBe(true);
  });

  it("showThumbnailUnavailable is a no-op when disconnected", () => {
    setup();
    const img = mountThumb();
    img.remove();
    showThumbnailUnavailable(img);
    expect(document.body.textContent).not.toContain("Thumbnail unavailable");
  });
});
