import type { QueryExecutor } from '../postgres';
import { AdminError } from './validation';
import { dialectOf, type SqlDialect } from '../sql';

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
const sinceClause = (dialect: SqlDialect) => dialect === 'sqlite' ? '$1' : `to_timestamp($1::double precision / 1000)`;
const dayExpression = (column: string, dialect: SqlDialect) =>
  dialect === 'sqlite'
    ? `date(${column}/1000,'unixepoch')`
    : `to_char(date_trunc('day',${column} AT TIME ZONE 'UTC'),'YYYY-MM-DD')`;
const publicLivePost = (dialect: SqlDialect) => dialect === 'sqlite'
  ? `p.deleted_at IS NULL AND p.hidden_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>$2)
  AND a.deleted_at IS NULL AND COALESCE(a.is_demo,0)=0
  AND NOT COALESCE((SELECT shadow_banned FROM profile_moderation pm WHERE pm.profile_id=p.author_id),0)`
  : `p.deleted_at IS NULL AND p.hidden_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>$2)
  AND a.deleted_at IS NULL AND COALESCE(a.is_demo,0)=0
  AND NOT COALESCE((SELECT shadow_banned FROM profile_moderation pm WHERE pm.profile_id=p.author_id),false)`;

/** Session refreshes are an explicitly labelled DAU proxy; the app does not
 * yet record a per-request activity event and this query does not invent one. */
export async function dashboardAnalytics(db: QueryExecutor, inputDays: unknown = 14, now = Date.now()): Promise<AnalyticsSnapshot> {
  const days = Number(inputDays);
  if (!Number.isSafeInteger(days) || ![14, 30, 90].includes(days)) throw new AdminError('Choose a 14, 30, or 90 day analytics window.');
  const dialect = dialectOf(db);
  const since = sinceClause(dialect);
  const live = publicLivePost(dialect);
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
    series('signups', `SELECT ${dayExpression('u."createdAt"',dialect)} AS date,COUNT(*) AS value
      FROM "user" u WHERE u."createdAt">=${since} GROUP BY 1`),
    series('activeUsers', `SELECT ${dayExpression('s."updatedAt"',dialect)} AS date,COUNT(DISTINCT s."userId") AS value
      FROM session s JOIN "user" u ON u.id=s."userId" WHERE s."updatedAt">=${since} AND u.deleted_at IS NULL GROUP BY 1`),
    series('creations', `SELECT ${dayExpression('p.created_at',dialect)} AS date,COUNT(*) AS value
      FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.created_at>=$1 AND p.deleted_at IS NULL AND a.deleted_at IS NULL AND COALESCE(a.is_demo,0)=0 GROUP BY 1`),
    series('messages', `SELECT ${dayExpression('m.created_at',dialect)} AS date,COUNT(*) AS value
      FROM messages m JOIN profiles sender ON sender.id=m.sender_id WHERE m.created_at>=$1 AND m.deleted_at IS NULL AND sender.deleted_at IS NULL AND COALESCE(sender.is_demo,0)=0 GROUP BY 1`),
    series('reports', `SELECT ${dayExpression('r.created_at',dialect)} AS date,COUNT(*) AS value
      FROM reports r LEFT JOIN profiles reporter ON reporter.id=r.reporter_id WHERE r.created_at>=$1 AND (reporter.id IS NULL OR COALESCE(reporter.is_demo,0)=0) GROUP BY 1`),
    series('storageBytes', `SELECT ${dayExpression('a.created_at',dialect)} AS date,COALESCE(SUM(a.size+COALESCE(a.source_retained_bytes,0)),0) AS value
      FROM assets a LEFT JOIN profiles owner ON owner.id=COALESCE(a.storage_owner,a.owner_id) WHERE a.created_at>=$1 AND (owner.id IS NULL OR COALESCE(owner.is_demo,0)=0) GROUP BY 1`),
  ]);

  const liveValues = [start, now];
  const [{ rows: topPosts }, { rows: topCreators }, { rows: categories }, { rows: hashtags }, { rows: [funnel] }] = await Promise.all([
    db.query(`SELECT p.id,p.caption,p.category,p.kind,a.username,a.name,p.created_at,
      (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like') AS likes,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL) AS comments,
      (SELECT COUNT(*) FROM reactions v WHERE v.post_id=p.id AND v.kind='seen') AS views
      FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.created_at>=$1 AND ${live}
      ORDER BY (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like')+
        (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL) DESC,p.created_at DESC,p.id LIMIT 10`, liveValues),
    db.query(`WITH live AS (
      SELECT p.id,p.author_id,
        (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like') AS likes,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL) AS comments
      FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.created_at>=$1 AND ${live}
    ) SELECT a.id,a.username,a.name,COUNT(live.id) AS creations,COALESCE(SUM(live.likes),0) AS likes,COALESCE(SUM(live.comments),0) AS comments
      FROM live JOIN profiles a ON a.id=live.author_id GROUP BY a.id,a.username,a.name
      ORDER BY COUNT(live.id) DESC,SUM(live.likes+live.comments) DESC,a.username LIMIT 10`, liveValues),
    db.query(`SELECT p.category,COUNT(*) AS creations FROM posts p JOIN profiles a ON a.id=p.author_id
      WHERE p.created_at>=$1 AND ${live} GROUP BY p.category ORDER BY creations DESC,p.category LIMIT 12`, liveValues),
    db.query(`SELECT p.caption
      FROM posts p JOIN profiles a ON a.id=p.author_id
      WHERE p.created_at>=$1 AND ${live}`, liveValues),
    db.query(`SELECT COUNT(*) AS members,SUM(CASE WHEN EXISTS(
        SELECT 1 FROM posts p WHERE p.author_id=profiles.id AND p.kind='post' AND p.deleted_at IS NULL
      ) THEN 1 ELSE 0 END) AS first_post_members
      FROM "user" u JOIN profiles ON profiles.id=u.id
      WHERE u.role='user' AND u.deleted_at IS NULL AND profiles.deleted_at IS NULL AND COALESCE(profiles.is_demo,0)=0`),
  ]);
  const hashtagCounts = new Map<string, number>();
  for (const row of hashtagRows) {
    const caption = String(row.caption ?? '');
    for (const match of caption.matchAll(/#([\p{L}\p{N}_]{1,50})/gu)) {
      const hashtag = match[1].toLowerCase();
      hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) ?? 0) + 1);
    }
  }
  const hashtags = [...hashtagCounts.entries()]
    .map(([hashtag, uses]) => ({ hashtag, uses }))
    .sort((left,right) => right.uses-left.uses || left.hashtag.localeCompare(right.hashtag))
    .slice(0,20);

  const members = asNumber(funnel.members), firstPostMembers = asNumber(funnel.first_post_members);
  return {
    days, daily,
    topPosts: topPosts.map(row => ({ ...row, id: String(row.id), created_at: asNumber(row.created_at), likes: asNumber(row.likes), comments: asNumber(row.comments), views: asNumber(row.views) })) as AnalyticsSnapshot['topPosts'],
    topCreators: topCreators.map(row => ({ ...row, id: String(row.id), creations: asNumber(row.creations), likes: asNumber(row.likes), comments: asNumber(row.comments) })) as AnalyticsSnapshot['topCreators'],
    categories: categories.map(row => ({ category: String(row.category), creations: asNumber(row.creations) })),
    hashtags,
    funnel: { members, firstPostMembers, conversionRate: members ? Math.round(firstPostMembers * 1000 / members) / 10 : 0 },
  };
}
