import { describe, expect, it, vi } from "vitest";

import { createPeerId, generateRoomCode, normalizeRoomCode } from "./room";

describe("room helpers", () => {
  it("generates a six digit room code", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.234567);

    expect(generateRoomCode()).toBe("311110");
  });

  it("normalizes a pasted six digit room code", () => {
    expect(normalizeRoomCode(" 123 456 ")).toBe("123456");
  });

  it("rejects room codes that are not exactly six digits", () => {
    expect(normalizeRoomCode("12345")).toBeNull();
    expect(normalizeRoomCode("1234567")).toBeNull();
    expect(normalizeRoomCode("12A456")).toBeNull();
  });

  it("creates role-prefixed peer ids", () => {
    expect(createPeerId("host")).toMatch(/^host-[a-z0-9]{10}$/);
    expect(createPeerId("viewer")).toMatch(/^viewer-[a-z0-9]{10}$/);
  });
});
