import { describe, expect, it } from "vitest";
import { HttpError } from "../errors";
import { parseUploadRequest } from "../validate/uploadRequest";

const validBody = {
  conversation: {
    conversation_id: "conv-1",
    user_id: "user-1",
  },
  capture: {
    capture_client: "manual",
    surface: "phase1-test",
  },
  turns: [
    {
      client_turn_id: "turn-1",
      speaker: "user",
      text: "Hello",
    },
  ],
};

describe("parseUploadRequest", () => {
  it("accepts a minimal valid UploadRequest", () => {
    const parsed = parseUploadRequest(validBody);
    expect(parsed.conversation.conversation_id).toBe("conv-1");
    expect(parsed.capture.capture_client).toBe("manual");
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0]?.client_turn_id).toBe("turn-1");
  });

  it("rejects non-object bodies", () => {
    expect(() => parseUploadRequest([])).toThrow(HttpError);
    try {
      parseUploadRequest("nope");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects empty turns array", () => {
    expect(() =>
      parseUploadRequest({ ...validBody, turns: [] }),
    ).toThrow(HttpError);
  });

  it("rejects missing client_turn_id", () => {
    expect(() =>
      parseUploadRequest({
        ...validBody,
        turns: [{ speaker: "user", text: "Hi" }],
      }),
    ).toThrow(HttpError);
  });

  it("rejects invalid speaker", () => {
    expect(() =>
      parseUploadRequest({
        ...validBody,
        turns: [
          {
            client_turn_id: "t1",
            speaker: "system",
            text: "nope",
          },
        ],
      }),
    ).toThrow(HttpError);
  });

  it("rejects missing conversation.user_id", () => {
    expect(() =>
      parseUploadRequest({
        ...validBody,
        conversation: { conversation_id: "conv-1" },
      }),
    ).toThrow(HttpError);
  });

  it("rejects missing capture.capture_client", () => {
    expect(() =>
      parseUploadRequest({
        ...validBody,
        capture: {},
      }),
    ).toThrow(HttpError);
  });
});
