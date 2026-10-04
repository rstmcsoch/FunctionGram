export type Person={id:string;username:string;name:string;bio:string;website?:string;avatar:string;is_demo:number;is_private?:number;followers:number;following:number;post_count:number;followed:number;blocked?:number;last_message?:string|null;verification_batch?:string|null};
export type MediaOption={ratio:'original'|'1:1'|'4:5'|'16:9';fit:'contain'|'cover';alt:string};
export type Post={display_likes?:number|null;display_comments?:number|null;display_views?:number|null;reel_credit?:string;id:string;author_id:string;media:string[];aspects?:number[]|null;media_options?:MediaOption[];tagged_users?:string[];highlighted?:boolean;edited_at?:number|null;media_type:'image'|'video';kind:'post'|'reel'|'story';caption:string;location:string;category:string;created_at:number;expires_at:number|null;likes:number;liked:number;saved:number;seen:number;comment_count:number;comment_preview?:{body:string;username:string}|null;author:Person};
export type Comment={id:string;post_id:string;author_id:string;body:string;created_at:number;username:string;avatar:string};
/**
 * One message as the API returns it.
 *
 * `media_key` is deliberately absent: the storage key of a private attachment
 * never leaves the server, and the bytes are fetched through
 * `/api/message-media/<id>`, which authorizes the two participants. `post_id`
 * and `profile_preview` are resolved per reader, so a shared post or profile the
 * recipient may not see arrives as `null` rather than as data.
 */
export type Message={id:string;sender_id:string;recipient_id:string;body:string;post_id?:string|null;created_at:number;read_at:number|null;reply_to_id?:string|null;edited_at?:number|null;message_type?:MessageType;media_url?:string|null;media_mime?:string|null;media_size?:number|null;media_duration?:number|null;media_width?:number|null;media_height?:number|null;media_filename?:string|null;sticker_id?:string|null;shared_profile_id?:string|null;forward_from_id?:string|null;forward_from_sender?:string|null;view_once?:number;view_once_consumed?:number;expires_at?:number|null;delivered_at?:number|null;deleted_at?:number|null;redacted_at?:number|null;pending?:boolean;failed?:boolean;saved?:number;reactions?:MessageReaction[];reply_preview?:{id?:string;body:string;sender_id:string;username:string;created_at?:number;deleted_at?:number|null;expires_at?:number|null}|null;profile_preview?:ProfilePreview|null};

/** Message kinds the composer can send. Mirrors `MESSAGE_TYPES` on the server. */
export type MessageType='text'|'image'|'video'|'voice'|'file'|'gif'|'sticker'|'post'|'profile';

/** A shared profile card, resolved for the reader. */
export type ProfilePreview={id:string;username:string;name:string;avatar:string;available:boolean};
export type Notification={id:string;actor_id:string;kind:string;post_id:string|null;created_at:number;read_at:number|null;username:string;avatar:string;media:string|null;media_type:string|null;template_text?:string;message_text?:string|null;broadcast_id?:string|null};
export type SavedCollection={id:string;name:string;created_at:number;post_ids:string[]};
export type MessageReaction={id:string;message_id:string;user_id:string;emoji:string;created_at:number;username?:string};
/** A `message_pins` row; the conversation is keyed by its two participants. */
export type MessagePin={id:string;message_id:string;conversation_key:string;pinned_by:string;created_at:number};
/** The viewer's own state for one conversation, with server defaults applied. */
export type ConversationState={id?:string;user_id:string;other_user_id:string;is_pinned:number;is_muted:number;mute_until:number|null;is_archived:number;is_favorite:number;marked_unread:number;theme:ChatTheme;disappearing_duration:number;read_receipts?:number;cleared_before?:number|null;updated_at?:number};

// The conversation list, its filters, the Chat Info content tabs, in-thread
// search results, pinned messages, stickers and the mute/theme/duration vocab
// are declared once on the server and re-exported as types here, so the client
// cannot drift from what the API returns. `export type` is erased at build
// time: no server module reaches the browser bundle.
export type {
  ChatTheme,
  ContentTab,
  ConversationFilter,
  ConversationSummary,
  MessageSearchResult,
  MuteDuration,
  PinnedMessage,
} from './messaging';
export type { Sticker } from './stickers';
import type { ChatTheme } from './messaging';
export type UserPresence={user_id:string;last_seen_at:number;is_online:number};
export type StoryViewer={username:string;name:string;avatar:string};
export type SocialData={features?:import('./features').Flags;messaging?:import('./messaging-policy').MessagingPolicy;stories?:import('./story-playback').PublicStorySettings;me:Person|null;people:Person[];posts:Post[];notifications:Notification[];unreadMessages:number;hasMore:boolean};
export type SearchResults={people:Person[];posts:Post[]};
