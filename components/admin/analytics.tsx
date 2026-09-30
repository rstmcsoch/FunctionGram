'use client';
import { useEffect, useState } from 'react';
import type { AnalyticsSnapshot } from '@/lib/admin/analytics';
import { bytes } from './ui';

const number = (value: number) => Number(value || 0).toLocaleString('en-IN');
const metrics = [
  { key: 'signups', label: 'Signups' },
  { key: 'activeUsers', label: 'Active sign-in proxy' },
  { key: 'creations', label: 'Creations' },
  { key: 'messages', label: 'Messages' },
  { key: 'reports', label: 'Reports' },
  { key: 'storageBytes', label: 'Uploaded storage' },
] as const;
type MetricKey = typeof metrics[number]['key'];
function Chart({ data, metric }: { data: AnalyticsSnapshot['daily']; metric: typeof metrics[number] }) {
  const max = Math.max(1, ...data.map(row => row[metric.key]));
  return <section className="admin-card analytics-chart"><h3>{metric.label}</h3><div className="analytics-bars" role="img" aria-label={`${metric.label} per UTC day`}>
    {data.map(row => <span key={row.date} title={`${row.date}: ${metric.key === 'storageBytes' ? bytes(row[metric.key]) : number(row[metric.key])}`} style={{ height: `${Math.max(row[metric.key] ? 4 : 1, Math.round(row[metric.key] * 100 / max))}%` }} />)}
  </div><div className="analytics-axis"><span>{data[0]?.date}</span><span>{data.at(-1)?.date}</span></div></section>;
}
export function AnalyticsDashboard({ initial }: { initial: AnalyticsSnapshot }) {
  const [days, setDays] = useState(initial.days), [data, setData] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (days === initial.days) return;
    let active = true;
    fetch(`/api/admin/analytics?days=${days}`, { cache: 'no-store' }).then(async response => {
      const payload = await response.json() as AnalyticsSnapshot | { error?: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error || 'Analytics could not be loaded.' : 'Analytics could not be loaded.');
      return payload as AnalyticsSnapshot;
    }).then(payload => { if (active) { setData(payload); setError(''); setBusy(false); } }).catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : 'Analytics could not be loaded.'); setBusy(false); } });
    return () => { active = false; };
  }, [days, initial.days]);
  const changeDays = (value: number) => { setError(''); if (value === initial.days) { setData(initial); setDays(value); setBusy(false); return; } setBusy(true); setDays(value); };
  const totals = metrics.reduce((all, metric) => ({ ...all, [metric.key]: data.daily.reduce((sum, row) => sum + row[metric.key], 0) }), {} as Record<MetricKey, number>);
  const conversion = Math.max(0, Math.min(100, data.funnel.conversionRate));
  return <div className="analytics-dashboard">
    <div className="admin-card analytics-controls"><div><h2>Community analytics</h2><p>Daily buckets use UTC. Active users are a session-refresh proxy, not per-request DAU; uploaded storage is new asset bytes in the period, not a historical retained-storage snapshot.</p></div><label>Window<select value={days} onChange={event => changeDays(Number(event.target.value))}><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label></div>
    {error && <p role="alert" className="admin-error">{error}</p>}{busy && <p role="status">Updating the analytics window…</p>}
    <section className="admin-stats analytics-summary" aria-label="Totals for selected UTC window">
      <article className="admin-stat"><span>Signups</span><strong>{number(totals.signups)}</strong></article>
      <article className="admin-stat"><span>Active sign-in proxy</span><strong>{number(totals.activeUsers)}</strong></article>
      <article className="admin-stat"><span>Creations</span><strong>{number(totals.creations)}</strong></article>
      <article className="admin-stat"><span>Messages</span><strong>{number(totals.messages)}</strong></article>
      <article className="admin-stat"><span>Reports</span><strong>{number(totals.reports)}</strong></article>
      <article className="admin-stat"><span>Asset bytes added</span><strong>{bytes(totals.storageBytes)}</strong></article>
    </section>
    <div className="analytics-chart-grid">{metrics.map(metric => <Chart key={metric.key} data={data.daily} metric={metric}/>)}</div>
    <div className="comms-grid analytics-lists">
      <section className="admin-card"><h2>Top content</h2><p>Visible, non-demo posts and reels from the selected window; ordered by real likes plus comments.</p><div className="admin-table-scroll" role="region" tabIndex={0} aria-label="Top content"><table><thead><tr><th>Creator / caption</th><th>Kind · category</th><th>Likes</th><th>Comments</th><th>Views</th></tr></thead><tbody>{data.topPosts.map(row => <tr key={row.id}><td><strong>{row.username}</strong><small>{row.name}</small><div className="analytics-caption">{row.caption}</div></td><td>{row.kind} · {row.category}</td><td>{number(row.likes)}</td><td>{number(row.comments)}</td><td>{number(row.views)}</td></tr>)}{!data.topPosts.length && <tr><td colSpan={5}>No eligible content in this window.</td></tr>}</tbody></table></div></section>
      <section className="admin-card"><h2>Top creators</h2><p>Content created in the selected window; interactions are real, not boosted display counts.</p><div className="admin-table-scroll" role="region" tabIndex={0} aria-label="Top creators"><table><thead><tr><th>Creator</th><th>Creations</th><th>Likes</th><th>Comments</th></tr></thead><tbody>{data.topCreators.map(row => <tr key={row.id}><td>{row.username}<small>{row.name}</small></td><td>{number(row.creations)}</td><td>{number(row.likes)}</td><td>{number(row.comments)}</td></tr>)}{!data.topCreators.length && <tr><td colSpan={4}>No eligible creators in this window.</td></tr>}</tbody></table></div></section>
      <section className="admin-card"><h2>Category usage</h2><div className="analytics-ranked-list">{data.categories.map((row,index) => <p key={row.category}><span>{index+1}. {row.category}</span><strong>{number(row.creations)}</strong></p>)}{!data.categories.length && <p>No categories in this window.</p>}</div></section>
      <section className="admin-card"><h2>Hashtag usage</h2><div className="analytics-ranked-list">{data.hashtags.map((row,index) => <p key={row.hashtag}><span>{index+1}. #{row.hashtag}</span><strong>{number(row.uses)}</strong></p>)}{!data.hashtags.length && <p>No hashtags in this window.</p>}</div></section>
    </div>
    <section className="admin-card analytics-funnel"><h2>Signup → first-post funnel</h2><p>Lifetime real member accounts with at least one non-deleted post (`kind=post`); demo profiles and reels/stories are excluded.</p><div className="analytics-funnel-bar" role="img" aria-label={`${number(data.funnel.firstPostMembers)} of ${number(data.funnel.members)} members made a first post`}><span style={{ width: `${conversion}%` }}/></div><strong>{number(data.funnel.firstPostMembers)} / {number(data.funnel.members)} members · {data.funnel.conversionRate}%</strong></section>
  </div>;
}
