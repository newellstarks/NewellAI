export function showThumbnailUnavailable(imgEl: {
  isConnected: boolean;
  ownerDocument?: {
    createElement(tag: string): {
      className: string;
      textContent: string;
    };
  } | null;
  replaceWith(node: unknown): void;
}): void;

export function loadThumbnail(
  imgEl: {
    isConnected: boolean;
    hidden: boolean;
    complete: boolean;
    naturalWidth: number;
    src: string;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
    removeAttribute(name: string): void;
    ownerDocument?: unknown;
  },
  artifactId: string,
  deps: {
    fetchBlob: (id: string) => Promise<Blob>;
    trackObjectUrl: (url: string) => string;
    revokeObjectUrl: (url: string) => void;
    createObjectURL?: (blob: Blob) => string;
  },
): Promise<void>;
