/** Device push token shape shared by the Android client and POST /api/push.
 * This file has no database, Firebase, or secret access. */
const TOKEN = /^[A-Za-z0-9:_.-]{20,4096}$/;

export function parseDeviceToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return TOKEN.test(token) ? token : null;
}

export function parsePushPlatform(value: unknown): "android" | null {
  if (value === undefined || value === "android") return "android";
  return null;
}
