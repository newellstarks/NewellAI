import { describe, expect, it } from "vitest";
import {
  authorizeCaptureEnqueue,
  authorizeLegacyEnqueue,
  CAPTURE_ENQUEUE_TYPE,
  isApprovedChatgptLocation,
  senderLocation,
} from "./messaging";

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
