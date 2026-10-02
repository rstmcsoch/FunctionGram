import { adminRoute } from '@/lib/admin/route';
import { adminBody } from '@/lib/admin/body';
import { requirePermission } from '@/lib/admin/permissions';
import { AdminError } from '@/lib/admin/validation';
import { getPool } from '@/lib/postgres';
import { createAdminCampaignEmailSender } from '@/lib/email';
import {
  deleteAnnouncement, inspectConversation, listAnnouncements, listConversations,
  listMessageAccounts, listMessageRestrictions, listNotificationTemplates, moderateMessage, previewEmailCampaign,
  saveAnnouncement, saveMessagingLimits, saveNotificationTemplate, sendEmailCampaign, sendInAppBroadcast,
  previewInAppBroadcast, readMessagingLimits, setDirectMessageControl, setMessageRestriction,
  updateEmailControls, getEmailControls,
} from '@/lib/admin/communications';
import { loadSettings } from '@/lib/admin/core';
import { revalidatePath, revalidateTag } from 'next/cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = adminRoute(async (request, actor) => {
  const db = await getPool(), params = new URL(request.url).searchParams, view = params.get('view');
  if (view === 'conversations') { requirePermission(actor, 'messages.read'); return Response.json(await listConversations(db, Object.fromEntries(params))); }
  if (view === 'accounts') { requirePermission(actor, 'messages.manage'); return Response.json(await listMessageAccounts(db, params.get('q') || '')); }
  if (view === 'limits') { requirePermission(actor, 'messages.manage'); return Response.json(readMessagingLimits(await loadSettings(db))); }
  if (view === 'restrictions') { requirePermission(actor, 'messages.manage'); return Response.json(await listMessageRestrictions(db, params.get('q') || '')); }
  if (view === 'templates') { requirePermission(actor, 'notifications.manage'); return Response.json(await listNotificationTemplates(db)); }
  if (view === 'email') { requirePermission(actor, 'email.send'); return Response.json(await getEmailControls(db)); }
  if (view === 'announcements') { requirePermission(actor, 'announcements.manage'); return Response.json(await listAnnouncements(db)); }
  throw new AdminError('Choose a communications view.');
}, 'messages.read');

export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request, 128000), pool = await getPool();
  switch (body.action) {
    case 'inspectConversation': return Response.json(await inspectConversation(pool, actor.userId, body));
    case 'moderateMessage': return Response.json(await moderateMessage(pool, actor.userId, body));
    case 'setDirectMessageControl': return Response.json(await setDirectMessageControl(pool, actor.userId, body));
    case 'saveMessagingLimits': {
      const saved = await saveMessagingLimits(pool, actor.userId, body);
      // The messaging limits are read through the tag-invalidated settings
      // cache, so the public API picks the change up without a redeploy.
      revalidateTag('settings', { expire: 0 });
      revalidatePath('/', 'layout');
      return Response.json(saved);
    }
    case 'setMessageRestriction': return Response.json(await setMessageRestriction(pool, actor.userId, body));
    case 'saveNotificationTemplate': return Response.json(await saveNotificationTemplate(pool, actor.userId, body));
    case 'previewInAppBroadcast': return Response.json(await previewInAppBroadcast(pool, actor.userId, body));
    case 'sendInAppBroadcast': return Response.json(await sendInAppBroadcast(pool, actor.userId, body));
    case 'updateEmailControls': return Response.json(await updateEmailControls(pool, actor.userId, body));
    case 'previewEmailCampaign': return Response.json(await previewEmailCampaign(pool, actor.userId, body));
    case 'sendEmailCampaign': {
      requirePermission(actor, 'email.send');
      let sender: ReturnType<typeof createAdminCampaignEmailSender>;
      try { sender = createAdminCampaignEmailSender(); }
      catch { throw new AdminError('Configure Brevo before sending administrator email.', 503); }
      return Response.json(await sendEmailCampaign(pool, actor.userId, body, sender));
    }
    case 'saveAnnouncement': return Response.json(await saveAnnouncement(pool, actor.userId, body));
    case 'deleteAnnouncement': return Response.json(await deleteAnnouncement(pool, actor.userId, body));
    default: throw new AdminError('Unknown communications action.');
  }
}, 'messages.read');
