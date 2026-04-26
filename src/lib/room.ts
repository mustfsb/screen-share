export type RoomRole = "host" | "viewer";

export function generateRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function normalizeRoomCode(value: string) {
  const normalized = value.replace(/\s+/g, "");

  if (!/^\d{6}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function createPeerId(role: RoomRole) {
  const randomPart = Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  return `${role}-${randomPart}`;
}
