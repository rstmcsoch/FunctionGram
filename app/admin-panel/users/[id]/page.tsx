import { notFound } from 'next/navigation';
import { assertAdminPagePermission, requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { userDetail } from '@/lib/admin/queries';
import { AdminError } from '@/lib/admin/validation';
import { USER_ACTIONS, type UserAction } from '@/lib/admin/users';
import { Drawer, DataTable, bytes } from '@/components/admin/ui';
import { UserActions } from '@/components/admin/actions';
import { PageHead } from '@/components/admin/page-head';
import { Avatar } from '@/components/admin/avatar';
import { AutoBadge } from '@/components/admin/badge';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage(); assertAdminPagePermission(actor,'users.read'); const { id } = await params;
  const detail = await userDetail(await getPool(), id).catch(error => { if (error instanceof AdminError && error.status === 404) notFound(); throw error; });
  const { user, counts, sessions } = detail;
  let actions: UserAction[] = [...USER_ACTIONS];
  if (id === actor.userId) actions = ['signout','resetPassword'];
  else if (user.role === 'owner' || (['admin','moderator'].includes(user.role) && actor.role !== 'owner')) actions = [];
  else if (user.deleted_at != null) actions = actor.role==='owner'?['restore']:[];
  else actions = actions.filter(action => action !== 'restore' && !(action === 'verify' && user.emailVerified) && !(['promote','promoteModerator'].includes(action) && (actor.role !== 'owner' || user.role !== 'user')) && !(action === 'demote' && (actor.role !== 'owner' || !['admin','moderator'].includes(user.role))) && !(action === 'unban' && !user.banned) && !(action === 'delete' && actor.role !== 'owner') && (actor.role==='owner'||!['promote','promoteModerator','demote'].includes(action)));
  // Epoch-millisecond values (such as a messaging suspension end) must reach Date as numbers:
  // `new Date('1790919078634')` is an Invalid Date, while date strings still parse as before.
  const date = (value: unknown) => new Date(typeof value === 'number' ? value : String(value)).toLocaleString('en-IN', { timeZone: 'UTC' }) + ' UTC';
  return <><PageHead breadcrumb="Control room / Account detail" title={user.name} avatar={<Avatar name={user.name} handle={user.username} email={user.email} seed={id} size={64} />} intro={<span className="admin-identity-meta">{user.email}<AutoBadge>{user.role}</AutoBadge>{user.username && <span className="admin-handle">@{user.username}</span>}<AutoBadge>{user.emailVerified ? 'Verified' : 'Unverified'}</AutoBadge>{user.deleted_at != null && <AutoBadge>In trash</AutoBadge>}</span>} />
    <div className="admin-detail"><Drawer title="Profile & access"><dl><dt>Username</dt><dd>{user.username || 'No profile yet'}</dd><dt>Bio</dt><dd>{user.bio || '—'}</dd><dt>Website</dt><dd>{user.website || '—'}</dd><dt>Profile visibility</dt><dd>{user.is_private ? 'Private' : 'Public'}</dd><dt>Email verified</dt><dd>{user.emailVerified ? 'Yes' : 'No'}</dd><dt>Joined</dt><dd>{date(user.createdAt)}</dd><dt>Ban reason</dt><dd>{user.banReason || '—'}</dd><dt>Ban expiry</dt><dd>{user.banExpires ? date(user.banExpires) : user.banned ? 'Indefinite' : 'Not banned'}</dd></dl></Drawer>
    <Drawer title="Activity & storage"><dl><dt>Content items</dt><dd>{Number(counts.posts)}</dd><dt>Comments</dt><dd>{Number(counts.comments)}</dd><dt>Messages sent (contents remain private)</dt><dd>{Number(counts.messages)}</dd><dt>Media storage</dt><dd>{bytes(counts.storage_bytes)}</dd><dt>Active sessions</dt><dd>{Number(counts.sessions)}</dd></dl></Drawer>
    <Drawer title="Messaging access"><small>Read-only. Change these under Communications, where each edit needs the account ID and a reason.</small><dl><dt>Direct messages</dt><dd>{detail.messaging?.dm_disabled?'Restricted':'Allowed'}</dd><dt>Sending</dt><dd>{detail.messaging?.send_disabled?'Blocked':'Allowed'}</dd><dt>Receiving</dt><dd>{detail.messaging?.receive_disabled?'Blocked':'Allowed'}</dd><dt>Suspension</dt><dd>{detail.messaging?.suspended?date(detail.messaging.suspended_until):'None'}</dd></dl></Drawer></div>
    <section className="admin-card"><h2>Account actions</h2><UserActions id={id} email={user.email} actions={actions} /></section>
    <DataTable caption="Active sessions — newest 50. No session tokens are exposed. Times are UTC." headings={['Created','Expires','IP address','Device / user agent']}>
      {sessions.map(session => <tr key={session.id}><td>{date(session.createdAt)}</td><td>{date(session.expiresAt)}</td><td>{session.ipAddress || 'Not recorded'}</td><td>{session.userAgent || 'Not recorded'}</td></tr>)}
      {!sessions.length && <tr><td colSpan={4}>No active sessions.</td></tr>}
    </DataTable>
  </>;
}
