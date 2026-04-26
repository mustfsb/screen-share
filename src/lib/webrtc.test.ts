import { describe, expect, it } from "vitest";

import { resolveIceServers } from "./webrtc";

describe("resolveIceServers", () => {
  it("uses a public STUN server when no env value is provided", () => {
    expect(resolveIceServers(undefined)).toEqual({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  });

  it("parses a JSON encoded ICE server array", () => {
    const raw = JSON.stringify([
      {
        urls: ["turn:turn.example.com:3478"],
        username: "demo",
        credential: "secret",
      },
    ]);

    expect(resolveIceServers(raw)).toEqual({
      iceServers: [
        {
          urls: ["turn:turn.example.com:3478"],
          username: "demo",
          credential: "secret",
        },
      ],
    });
  });

  it("falls back to STUN and returns an error for invalid JSON", () => {
    expect(resolveIceServers("not-json")).toEqual({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      error:
        "NEXT_PUBLIC_RTC_ICE_SERVERS must be a JSON array of RTCIceServer objects.",
    });
  });
});
