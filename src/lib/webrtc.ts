const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

const ICE_SERVER_ERROR =
  "NEXT_PUBLIC_RTC_ICE_SERVERS must be a JSON array of RTCIceServer objects.";

export type IceServerResolution = {
  iceServers: RTCIceServer[];
  error?: string;
};

type DisplayMediaOptionsWithAudioHints = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude";
  windowAudio?: "exclude" | "system" | "window";
  surfaceSwitching?: "include" | "exclude";
};

export function resolveIceServers(rawValue: string | undefined): IceServerResolution {
  if (!rawValue) {
    return { iceServers: DEFAULT_ICE_SERVERS };
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed) || !parsed.every(isIceServerLike)) {
      return { iceServers: DEFAULT_ICE_SERVERS, error: ICE_SERVER_ERROR };
    }

    return { iceServers: parsed };
  } catch {
    return { iceServers: DEFAULT_ICE_SERVERS, error: ICE_SERVER_ERROR };
  }
}

function isIceServerLike(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const urls = (value as { urls?: unknown }).urls;
  return (
    typeof urls === "string" ||
    (Array.isArray(urls) && urls.every((url) => typeof url === "string"))
  );
}

export function getDisplayMediaOptions(): DisplayMediaOptionsWithAudioHints {
  return {
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    systemAudio: "include",
    windowAudio: "system",
    surfaceSwitching: "include",
  };
}
