// SQL fragments accept only source-code aliases (never request input).
// Public views never bypass moderation, including for authors and admins.
export function visibleComment(c = 'c') {
  return `${c}.hidden_at IS NULL AND ${c}.deleted_at IS NULL AND EXISTS(SELECT 1 FROM profiles ca WHERE ca.id=${c}.author_id AND ca.deleted_at IS NULL)`;
}
export function visiblePost(p = 'p') {
  return `${p}.hidden_at IS NULL AND ${p}.deleted_at IS NULL AND EXISTS(SELECT 1 FROM profiles pa WHERE pa.id=${p}.author_id AND pa.deleted_at IS NULL)
    AND (${p}.kind!='reel' OR COALESCE((SELECT value FROM app_settings WHERE key='content.reelsEnabled'),'true')='true')`;
}
export function livePost(p = 'p') {
  return `(${visiblePost(p)}) AND (${p}.expires_at IS NULL OR ${p}.expires_at > extract(epoch FROM now())*1000)`;
}
// Caller binds the viewer four times, in this order: privacy, follow, block, shadow-ban self-visibility.
export function readablePost(p = 'p', a = 'a') {
  return `(${livePost(p)}) AND (${a}.is_private=0 OR ${p}.author_id=? OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followee_id=${p}.author_id))
    AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE b.blocker_id=? AND b.blocked_id=${p}.author_id)
    AND (NOT COALESCE((SELECT shadow_banned FROM profile_moderation m WHERE m.profile_id=${p}.author_id),false) OR ${p}.author_id=?)`;
}
