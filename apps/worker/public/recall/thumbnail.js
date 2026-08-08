/**
 * Recall thumbnail post-fetch DOM rendering.
 * Never logs tokens, URLs, storage paths, or bytes.
 */

/**
 * Replace a thumb img with a visible failure label.
 * @param {HTMLElement} imgEl
 */
export function showThumbnailUnavailable(imgEl) {
  if (!imgEl || !imgEl.isConnected) return;
  const doc = imgEl.ownerDocument ?? globalThis.document;
  if (!doc) return;
  const err = doc.createElement("span");
  err.className = "artifact-status failed";
  err.textContent = "Thumbnail unavailable";
  imgEl.replaceWith(err);
}

/**
 * Load artifact bytes into an img element and reveal on successful decode.
 *
 * @param {HTMLImageElement} imgEl
 * @param {string} artifactId
 * @param {{
 *   fetchBlob: (id: string) => Promise<Blob>,
 *   trackObjectUrl: (url: string) => string,
 *   revokeObjectUrl: (url: string) => void,
 *   createObjectURL?: (blob: Blob) => string,
 * }} deps
 */
export async function loadThumbnail(imgEl, artifactId, deps) {
  const createObjectURL = deps.createObjectURL ?? ((b) => URL.createObjectURL(b));
  let objectUrl = null;

  try {
    const blob = await deps.fetchBlob(artifactId);

    // Rerender removed this node; its replacement will start a fresh load.
    if (!imgEl.isConnected) {
      return;
    }

    objectUrl = deps.trackObjectUrl(createObjectURL(blob));

    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        let disconnectPoll = null;
        const finish = (fn) => {
          if (settled) return;
          settled = true;
          if (disconnectPoll !== null) {
            clearInterval(disconnectPoll);
            disconnectPoll = null;
          }
          imgEl.removeEventListener("load", onLoad);
          imgEl.removeEventListener("error", onError);
          fn();
        };
        const onLoad = () => finish(resolve);
        const onError = () =>
          finish(() => reject(new Error("image_decode_failed")));

        // Handlers before src so we never miss a sync/cached load/error.
        imgEl.addEventListener("load", onLoad);
        imgEl.addEventListener("error", onError);
        imgEl.src = objectUrl;

        // Cached / sync decode: complete may already be true after src assign.
        if (imgEl.complete && imgEl.naturalWidth > 0) {
          finish(resolve);
        } else if (imgEl.complete && imgEl.naturalWidth === 0) {
          finish(() => reject(new Error("image_decode_failed")));
        } else {
          // If navigation removes the node mid-decode, exit without hanging.
          disconnectPoll = setInterval(() => {
            if (!imgEl.isConnected) {
              finish(() => reject(new Error("thumbnail_disconnected")));
            }
          }, 50);
        }
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "thumbnail_disconnected"
      ) {
        deps.revokeObjectUrl(objectUrl);
        objectUrl = null;
        return;
      }
      throw err;
    }

    if (!imgEl.isConnected) {
      deps.revokeObjectUrl(objectUrl);
      objectUrl = null;
      return;
    }

    // Successful 200 + decode: never leave the thumb permanently hidden.
    imgEl.hidden = false;
    imgEl.removeAttribute("hidden");
  } catch {
    if (objectUrl) {
      deps.revokeObjectUrl(objectUrl);
      objectUrl = null;
    }
    // Fetch/decode failure: visible unavailable when the node is still mounted.
    // Disconnected nodes are dropped by rerender; the new node retries.
    if (imgEl.isConnected) {
      showThumbnailUnavailable(imgEl);
    }
  }
}
