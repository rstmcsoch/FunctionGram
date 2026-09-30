import type { QueryExecutor } from '../postgres';
import { AdminError } from './validation';

export type AnalyticsDay = {
  date: string;
  signups: number;
  activeUsers: number;
  creations: number;
  messages: number;
  reports: number;
  storageBytes: number;
};
export type AnalyticsSnapshot = {
  days: number;
  daily: AnalyticsDay[];
  topPosts: { id: string; caption: string; category: string; kind: string; username: string; name: string; created_at: number; likes: number; comments: number; views: number }[];
  topCreators: { id: string; username: string; name: string; creations: number; likes: number; comments: number }[];
  categories: { category: string; creations: number }[];
  hashtags: { hashtag: string; uses: number }[];
  funnel: { members: number; firstPostMembers: number; conversionRate: number };
};

const DAY_MS = 86_400_000;
const utcDay = (value: number) => Math.floor(value / DAY_MS) * DAY_MS;
const asNumber = (value: unknown) => Number(value ?? 0);
const dayKey = (value: unknown) => String(value instanceof Date ? value.toISOString().slice(0, 10) : value);
const sinceClause = `to_timestamp($1::double precision / 1000)`;
const publicLivePost = `p.deleted_at IS NULL AND p.hidden_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>$2)
  AND a.deleted_at IS NULL AND COALESCE(a.is_demo,0)=0
  AND NOT COALESCE((SELECT shadow_banned FROM profile_moderation pm WHERE pm.profile_id=p.author_id),false)`;

/** Session refreshes are an explicitly labelled DAU proxy; the app does not
 * yet record a per-request activity event and this query does not invent one. */
export async function dashboardAnalytics(db: QueryExecutor, inputDays: unknown = 14, now = Date.now()): Promise<AnalyticsSnapshot> {
  const days = Number(inputDays);
  if (!Number.isSafeInteger(days) || ![14, 30, 90].includes(days)) throw new AdminError('Choose a 14, 30, or 90 day analytics window.');
  const start = utcDay(now) - (days - 1) * DAY_MS;
  const daily: AnalyticsDay[] = Array.from({ length: days }, (_, index) => ({
    date: new Date(start + index * DAY_MS).toISOString().slice(0, 10),
    signups: 0, activeUsers: 0, creations: 0, messages: 0, reports: 0, storageBytes: 0,
  }));
  const positions = new Map(daily.map((item, index) => [item.date, index]));
  const series = async (column: keyof Omit<AnalyticsDay, 'date'>, sql: string, values: unknown[] = [start]) => {
    const { rows } = await db.query(sql, values);
    for (const row of rows) {
      const index = positions.get(dayKey(row.date));
      if (index !== undefined) daily[index][column] = asNumber(row.value);
    }
  };
  await Promise.all([
    series('signups', `SELECT to_char(date_trunc('day',u."createdAt" AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS date,COUNT(*) AS value
      FROM "user" u WHERE u."createdAt">=${sinceClause} GROUP BY 1`),
    series('activeUsers', `SELECT to_char(date_trunc('day',s."updatedAt" AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS date,COUNT(DISTINCT s."userId") AS value
      FROM session s JOIN "user" u ON u.id=s."userId" WHERE s."updatedAt">=${sinceClause} AND u.deleted_at IS NULL GROUP BY 1`),
    series('creations', `SELECT to_char(date_trunc('day',to_timestamp(p.created_at::double precision/1000) AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS date,COUNT(*) AS value
      FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.created_at>=$1 AND p.deleted_at IS NULL AND a.deleted_at IS NULL AND COALESCE(a.is_demo,0)=0 GROUP BY 1`),
    series('messages', `SELECT to_char(date_trunc('day',to_timestamp(m.created_at::double precision/1000) AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS date,COUNT(*) AS value
      FROM messages m JOIN profiles sender ON sender.id=m.sender_id WHERE m.created_at>=$1 AND m.deleted_at IS NULL AND sender.deleted_at IS NULL AND COALESCE(sender.is_demo,0)=0 GROUP BY 1`),
    series('reports', `SELECT to_char(date_trunc('day',to_timestamp(r.created_at::double precision/1000) AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS date,COUNT(*) AS value
      FROM reports r LEFT JOIN profiles reporter ON reporter.id=r.reporter_id WHERE r.created_at>=$1 AND (reporter.id IS NULL OR COALESCE(reporter.is_demo,0)=0) GROUP BY 1`),
    series('storageBytes', `SELECT to_char(date_trunc('day',to_timestamp(a.created_at::double precision/1000) AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS date,COALESCE(SUM(a.size+COALESCE(a.source_retained_bytes,0)),0) AS value
      FROM assets a LEFT JOIN profiles owner ON owner.id=COALESCE(a.storage_owner,a.owner_id) WHERE a.created_at>=$1 AND (owner.id IS NULL OR COALESCE(owner.is_demo,0)=0) GROUP BY 1`),
  ]);

  const liveValues = [start, now];
  const [{ rows: topPosts }, { rows: topCreators }, { rows: categories }, { rows: hashtags }, { rows: [funnel] }] = await Promise.all([
    db.query(`SELECT p.id,p.caption,p.category,p.kind,a.username,a.name,p.created_at,
      (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like') AS likes,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL) AS comments,
      (SELECT COUNT(*) FROM reactions v WHERE v.post_id=p.id AND v.kind='seen') AS views
      FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.created_at>=$1 AND ${publicLivePost}
      ORDER BY (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like')+
        (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL) DESC,p.created_at DESC,p.id LIMIT 10`, liveValues),
    db.query(`WITH live AS (
      SELECT p.id,p.author_id,
        (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like') AS likes,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL) AS comments
      FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.created_at>=$1 AND ${publicLivePost}
    ) SELECT a.id,a.username,a.name,COUNT(live.id) AS creations,COALESCE(SUM(live.likes),0) AS likes,COALESCE(SUM(live.comments),0) AS comments
      FROM live JOIN profiles a ON a.id=live.author_id GROUP BY a.id,a.username,a.name
      ORDER BY COUNT(live.id) DESC,SUM(live.likes+live.comments) DESC,a.username LIMIT 10`, liveValues),
    db.query(`SELECT p.category,COUNT(*) AS creations FROM posts p JOIN profiles a ON a.id=p.author_id
      WHERE p.created_at>=$1 AND ${publicLivePost} GROUP BY p.category ORDER BY creations DESC,p.category LIMIT 12`, liveValues),
    db.query(`SELECT lower(matches.matched[1]) AS hashtag,COUNT(*) AS uses
      FROM posts p JOIN profiles a ON a.id=p.author_id
      CROSS JOIN LATERAL regexp_matches(p.caption,'#([[:alnum:]_]{1,50})','g') AS matches(matched)
      WHERE p.created_at>=$1 AND ${publicLivePost} GROUP BY lower(matches.matched[1]) ORDER BY uses DESC,hashtag LIMIT 20`, liveValues),
    db.query(`SELECT COUNT(*) AS members,COUNT(*) FILTER(WHERE EXISTS(
        SELECT 1 FROM posts p WHERE p.author_id=profiles.id AND p.kind='post' AND p.deleted_at IS NULL
      )) AS first_post_members
      FROM "user" u JOIN profiles ON profiles.id=u.id
      WHERE u.role='user' AND u.deleted_at IS NULL AND profiles.deleted_at IS NULL AND COALESCE(profiles.is_demo,0)=0`),
  ]);
  const members = asNumber(funnel.members), firstPostMembers = asNumber(funnel.first_post_members);
  return {
    days, daily,
    topPosts: topPosts.map(row => ({ ...row, id: String(row.id), created_at: asNumber(row.created_at), likes: asNumber(row.likes), comments: asNumber(row.comments), views: asNumber(row.views) })) as AnalyticsSnapshot['topPosts'],
    topCreators: topCreators.map(row => ({ ...row, id: String(row.id), creations: asNumber(row.creations), likes: asNumber(row.likes), comments: asNumber(row.comments) })) as AnalyticsSnapshot['topCreators'],
    categories: categories.map(row => ({ category: String(row.category), creations: asNumber(row.creations) })),
    hashtags: hashtags.map(row => ({ hashtag: String(row.hashtag), uses: asNumber(row.uses) })),
    funnel: { members, firstPostMembers, conversionRate: members ? Math.round(firstPostMembers * 1000 / members) / 10 : 0 },
  };
}
