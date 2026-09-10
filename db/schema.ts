import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), username: text('username').notNull(), name: text('name').notNull(),
  bio: text('bio').notNull().default(''), avatar: text('avatar').notNull().default(''),
  isDemo: integer('is_demo').notNull().default(0), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('profiles_username_unique').on(t.username)]);
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), authorId: text('author_id').notNull().references(() => profiles.id, {onDelete:'cascade'}),
  media: text('media').notNull(), mediaType: text('media_type').notNull().default('image'),
  kind: text('kind').notNull().default('post'), caption: text('caption').notNull().default(''),
  location: text('location').notNull().default(''), category: text('category').notNull().default('For you'),
  baseLikes: integer('base_likes').notNull().default(0), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at'),
}, t=>[index('idx_posts_author_created').on(t.authorId,t.createdAt),index('idx_posts_kind_created').on(t.kind,t.createdAt)]);
export const reactions = sqliteTable('reactions', {
  userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
  postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}), kind:text('kind').notNull(),
},t=>[primaryKey({columns:[t.userId,t.postId,t.kind]}),index('idx_reactions_post_kind').on(t.postId,t.kind)]);
export const comments = sqliteTable('comments', {
  id:text('id').primaryKey(), postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
  authorId:text('author_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}), body:text('body').notNull(), createdAt:integer('created_at').notNull(),
},t=>[index('idx_comments_post_created').on(t.postId,t.createdAt)]);
export const follows = sqliteTable('follows', {
  followerId:text('follower_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
  followeeId:text('followee_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
},t=>[primaryKey({columns:[t.followerId,t.followeeId]}),index('idx_follows_followee').on(t.followeeId)]);
export const messages = sqliteTable('messages', {
  id:text('id').primaryKey(), senderId:text('sender_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
  recipientId:text('recipient_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
  body:text('body').notNull(), createdAt:integer('created_at').notNull(), readAt:integer('read_at'),
},t=>[index('idx_messages_sender_recipient_time').on(t.senderId,t.recipientId,t.createdAt),index('idx_messages_recipient_time').on(t.recipientId,t.createdAt)]);
export const notifications = sqliteTable('notifications', {
  id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
  actorId:text('actor_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}), kind:text('kind').notNull(),
  postId:text('post_id').references(()=>posts.id,{onDelete:'cascade'}),createdAt:integer('created_at').notNull(), readAt:integer('read_at'),
},t=>[index('idx_notifications_user_created').on(t.userId,t.createdAt)]);
export const assets = sqliteTable('assets', {
  key:text('key').primaryKey(),ownerId:text('owner_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),
  mime:text('mime').notNull(),size:integer('size').notNull(),createdAt:integer('created_at').notNull(),
});
