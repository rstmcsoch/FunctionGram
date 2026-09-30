import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { assertAdminPagePermission, requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { userDetail } from '@/lib/admin/queries';
import { AdminError } from '@/lib/admin/validation';
import { USER_ACTIONS, type UserAction } from '@/lib/admin/users';
import { Drawer, DataTable, bytes } from '@/components/admin/ui';
import { UserActions } from '@/components/admin/actions';
import { PageHead } from '@/components/admin/page-head';
import { Avatar } from '@/components/admin/avatar';
import { Badge } from '@/components/admin/badge';

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
  const access = user.deleted_at != null ? 'In trash' : user.banned ? 'Banned' : 'Active';
  return <>
    <PageHead breadcrumb="Control room / Account detail" title={user.name}>
      <p>{user.email} · {user.role} {user.deleted_at != null && '· In trash'}</p>
    </PageHead>
    <section className="admin-card">
      <div className="admin-profile">
        <Avatar name={user.name} seed={user.id} size={64} />
        <div className="admin-profile-text">
          <h2>{user.name}</h2>
          <p>{user.username ? '@' + user.username : 'No profile yet'}</p>
          <div className="admin-badges">
            <Badge>{user.role}</Badge>
            <Badge>{access}</Badge>
            {user.emailVerified ? <Badge tone="success"><Check aria-hidden="true" focusable="false" />Verified</Badge> : <Badge tone="warning">Unverified</Badge>}
          </div>
        </div>
      </div>
    </section>
    <div className="admin-detail"><Drawer title="Profile & access"><dl><dt>Username</dt><dd>{user.username || 'No profile yet'}</dd><dt>Bio</dt><dd>{user.bio || '—'}</dd><dt>Website</dt><dd>{user.website || '—'}</dd><dt>Profile visibility</dt><dd>{user.is_private ? 'Private' : 'Public'}</dd><dt>Email verified</dt><dd>{user.emailVerified ? 'Yes' : 'No'}</dd><dt>Joined</dt><dd>{date(user.createdAt)}</dd><dt>Ban reason</dt><dd>{user.banReason || '—'}</dd><dt>Ban expiry</dt><dd>{user.banExpires ? date(user.banExpires) : user.banned ? 'Indefinite' : 'Not banned'}</dd></dl></Drawer>
    <Drawer title="Activity & storage"><dl><dt>Content items</dt><dd>{Number(counts.posts)}</dd><dt>Comments</dt><dd>{Number(counts.comments)}</dd><dt>Messages sent (contents remain private)</dt><dd>{Number(counts.messages)}</dd><dt>Media storage</dt><dd>{bytes(counts.storage_bytes)}</dd><dt>Active sessions</dt><dd>{Number(counts.sessions)}</dd></dl></Drawer></div>
    <DataTable caption="Active sessions — newest 50. No session tokens are exposed. Times are UTC." headings={['Created','Expires','IP address','Device / user agent']}>
      {sessions.map(session => <tr key={session.id}><td>{date(session.createdAt)}</td><td>{date(session.expiresAt)}</td><td>{session.ipAddress || 'Not recorded'}</td><td>{session.userAgent || 'Not recorded'}</td></tr>)}
      {!sessions.length && <tr><td colSpan={4} className="is-empty">No active sessions.</td></tr>}
    </DataTable>
    <section className="admin-card"><h2>Account actions</h2><UserActions id={id} email={user.email} actions={actions} /></section>
  </>;
}
