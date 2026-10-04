import { AppError } from "./server";
import { db } from "./server-db";
import { featurePolicy, requireFeature, requirePublic } from "./feature-policy";
import { parseDeviceToken, parsePushPlatform } from "./push-token-policy";

export { parseDeviceToken, parsePushPlatform } from "./push-token-policy";

/** No Firebase Admin credential is read or required. Tokens can be stored; nothing is sent to FCM. */
export const PUSH_DELIVERY = "not_configured" as const;

function enabledFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export async function readPushSettings(userId: string) {
  const policy = await featurePolicy(userId);
  requirePublic(policy, userId);
  const templates = await db()
    .prepare("SELECT kind, enabled FROM admin_notification_templates")
    .all<{ kind: string; enabled: unknown }>();
  const muted = await db()
    .prepare(
      `SELECT other_user_id FROM conversation_state
       WHERE user_id=? AND is_muted=1 AND (mute_until IS NULL OR mute_until>?)
       LIMIT 200`,
    )
    .bind(userId, Date.now())
    .all<{ other_user_id: string }>();
  const kinds: Record<string, boolean> = {};
  for (const row of templates.results) {
    if (row && typeof row.kind === "string" && row.kind) kinds[row.kind] = enabledFlag(row.enabled);
  }
  return {
    notificationsEnabled: !!policy.flags.notifications,
    kinds,
    mutedPeerIds: muted.results.map((row) => row.other_user_id).filter((id) => typeof id === "string" && id),
    pushDelivery: PUSH_DELIVERY,
  };
}

export async function registerDeviceToken(userId: string, tokenValue: unknown, platformValue: unknown) {
  const token = parseDeviceToken(tokenValue);
  const platform = parsePushPlatform(platformValue);
  if (!token || !platform) throw new AppError("Please check your input.");
  const policy = await featurePolicy(userId);
  requirePublic(policy, userId);
  requireFeature(policy, "notifications");
  await db()
    .prepare(
      `INSERT INTO device_push_tokens (token, user_id, platform, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, platform=excluded.platform, updated_at=excluded.updated_at`,
    )
    .bind(token, userId, platform, Date.now())
    .run();
  return { ok: true as const };
}

export async function unregisterDeviceToken(userId: string, tokenValue: unknown) {
  const token = parseDeviceToken(tokenValue);
  if (!token) throw new AppError("Please check your input.");
  const result = await db()
    .prepare("DELETE FROM device_push_tokens WHERE token=? AND user_id=?")
    .bind(token, userId)
    .run();
  return { ok: true as const, removed: (result.meta.changes || 0) > 0 };
}
