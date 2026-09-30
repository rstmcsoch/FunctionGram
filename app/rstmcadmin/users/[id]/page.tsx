import { notFound } from 'next/navigation';
import { assertAdminPagePermission, requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { userDetail } from '@/lib/admin/queries';
import { AdminError } from '@/lib/admin/validation';
import { USER_ACTIONS, type UserAction } from '@/lib/admin/users';
import { Drawer, DataTable, bytes } from '@/components/admin/ui';
import { UserActions } from '@/components/admin/actions';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage(); assertAdminPagePermission(actor,'users.read'); const { id } = await params;
  const detail = await userDetail(await getPool(), id).catch(error => { if (error instanceof AdminError && error.status === 404) notFound(); throw error; });
  const { user, counts, sessions } = detail;
  let actions: UserAction[] = [...USER_ACTIONS];
  if (id === actor.userId) actions = ['signout','resetPassword'];
  else if (user.role === 'owner' || (['admin','moderator'].includes(user.role) && actor.role !== 'owner')) actions = [];
  else if (user.deleted_at != null) actions = actor.role==='owner'?['restore']:[];
  else actions = actions.filter(action => action !== 'restore' && !(action === 'verify' && user.emailVerified) && !(['promote','promoteModerator'].includes(action) && (actor.role !== 'owner' || user.role !== 'user')) && !(action === 'demote' && (actor.role !== 'owner' || !['admin','moderator'].includes(user.role))) && !(action === 'unban' && !user.banned) && (actor.role==='owner'||!['promote','promoteModerator','demote'].includes(action)));
  const date = (value: unknown) => new Date(String(value)).toLocaleString('en-IN', { timeZone: 'UTC' }) + ' UTC';
  return <><p className="admin-eyebrow">Control room / Account detail</p><h1>{user.name}</h1><p>{user.email} · {user.role} {user.deleted_at != null && '· In trash'}</p>
    <div className="admin-detail"><Drawer title="Profile & access"><dl><dt>Username</dt><dd>{user.username || 'No profile yet'}</dd><dt>Bio</dt><dd>{user.bio || '—'}</dd><dt>Website</dt><dd>{user.website || '—'}</dd><dt>Profile visibility</dt><dd>{user.is_private ? 'Private' : 'Public'}</dd><dt>Email verified</dt><dd>{user.emailVerified ? 'Yes' : 'No'}</dd><dt>Joined</dt><dd>{date(user.createdAt)}</dd><dt>Ban reason</dt><dd>{user.banReason || '—'}</dd><dt>Ban expiry</dt><dd>{user.banExpires ? date(user.banExpires) : user.banned ? 'Indefinite' : 'Not banned'}</dd></dl></Drawer>
    <Drawer title="Activity & storage"><dl><dt>Content items</dt><dd>{Number(counts.posts)}</dd><dt>Comments</dt><dd>{Number(counts.comments)}</dd><dt>Messages sent (contents remain private)</dt><dd>{Number(counts.messages)}</dd><dt>Media storage</dt><dd>{bytes(counts.storage_bytes)}</dd><dt>Active sessions</dt><dd>{Number(counts.sessions)}</dd></dl></Drawer></div>
    <section className="admin-card"><h2>Account actions</h2><UserActions id={id} email={user.email} actions={actions} /></section>
    <DataTable caption="Active sessions — newest 50. No session tokens are exposed. Times are UTC." headings={['Created','Expires','IP address','Device / user agent']}>
      {sessions.map(session => <tr key={session.id}><td>{date(session.createdAt)}</td><td>{date(session.expiresAt)}</td><td>{session.ipAddress || 'Not recorded'}</td><td>{session.userAgent || 'Not recorded'}</td></tr>)}
      {!sessions.length && <tr><td colSpan={4}>No active sessions.</td></tr>}
    </DataTable>
  </>;
}
