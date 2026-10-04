package com.functiongram.app.feed

import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.data.feed.FeedCodec
import com.functiongram.app.data.feed.FeedCopy
import com.functiongram.app.data.feed.FeedDerive
import com.functiongram.app.data.feed.FeedFailureKind
import com.functiongram.app.data.feed.FeedMediaCache
import com.functiongram.app.data.feed.FeedPaging
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.feed.PostMediaRef
import com.functiongram.app.data.feed.StoryGesture
import com.functiongram.app.data.feed.StoryPlayback
import com.functiongram.app.data.feed.FeedTime
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.remote.ApiRoutes
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedMappingTest {
    private val origin = ApiEnvironment.PUBLIC_API_ORIGIN
    private val imageKey = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    private val imageKey2 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
    private val imageKey3 = "cccccccc-dddd-4eee-8fff-000000000000"

    @Test
    fun homeMapsPostsFlagsStoriesAndHasMore() {
        val parsed = FeedCodec.home(200, homeJson())
        val home = (parsed as FeedCall.Ok).value
        assertEquals("viewer-1", home.viewerId)
        assertTrue(home.flags.stories)
        assertTrue(home.flags.follow)
        assertFalse(home.flags.reels)
        assertTrue(home.storySettings.enabled)
        assertTrue(home.storySettings.tray)
        assertEquals(5, home.storySettings.photoSeconds)
        assertFalse(home.hasMore)
        assertEquals(3, home.posts.size)
        val multi = home.posts[0]
        assertEquals(listOf(imageKey, imageKey2, imageKey3), multi.media.map { it.key })
        assertEquals(0.8, multi.media[0].aspect!!, 0.001)
        assertEquals("hill", multi.media[0].alt)
        assertEquals("ada", multi.author.username)
        assertTrue(multi.liked)
        assertFalse(multi.saved)
        assertEquals(4, multi.displayLikes)
        assertEquals("nice", multi.commentPreview?.body)
        assertNull(home.posts[1].displayLikes)
        assertEquals("story", home.posts[2].kind)
        assertEquals(1_800_000_000_000L, home.posts[2].expiresAt)
    }

    @Test
    fun absentFeaturesAndStorySettingsStayOff() {
        val body = """{"posts":[],"hasMore":false,"me":null}"""
        val home = (FeedCodec.home(200, body) as FeedCall.Ok).value
        assertFalse(home.flags.stories)
        assertFalse(home.flags.reels)
        assertFalse(home.flags.follow)
        assertFalse(home.flags.comments)
        assertFalse(home.storySettings.enabled)
        assertFalse(home.storySettings.tray)
        assertNull(home.viewerId)
        assertTrue(home.posts.isEmpty())
    }

    @Test
    fun offsetFollowingCommentsAndSinglePost() {
        val page = (FeedCodec.postList(200, "[${postJson(id = "p-off")}]") as FeedCall.Ok).value
        assertEquals("p-off", page.single().id)
        val following = (FeedCodec.following(200, """{"posts":[${postJson(id = "p-f")}],"hasMore":true}""") as FeedCall.Ok).value
        assertTrue(following.hasMore)
        assertEquals("p-f", following.posts.single().id)
        val missing = (FeedCodec.onePost(200, "[]") as FeedCall.Ok).value
        assertNull(missing)
        val comments = (FeedCodec.comments(
            200,
            """{"items":[{"id":"c1","post_id":"p1","author_id":"u2","body":"hello","created_at":1700000000000,"username":"bea","avatar":""}],"next_cursor":"1700000000000,c1"}""",
        ) as FeedCall.Ok).value
        assertEquals("hello", comments.items.single().body)
        assertEquals("bea", comments.items.single().username)
        assertEquals("1700000000000,c1", comments.nextCursor)
    }

    @Test
    fun serverErrorsKeepTheServerString() {
        val signIn = FeedCodec.failure(401, """{"error":"Sign in to join the conversation."}""")
        assertEquals(FeedFailureKind.SIGN_IN, signIn.kind)
        assertEquals("Sign in to join the conversation.", signIn.message)
        val missing = FeedCodec.failure(404, """{"error":"This post is no longer available."}""")
        assertEquals("This post is no longer available.", missing.message)
        val media = FeedCodec.failure(404, """{"error":"Media not found."}""")
        assertEquals("Media not found.", media.message)
        val paused = FeedCodec.failure(503, """{"error":"FunctionGram is down for maintenance."}""")
        assertEquals(FeedFailureKind.UNAVAILABLE, paused.kind)
        assertEquals("FunctionGram is down for maintenance.", paused.message)
        val limited = FeedCodec.failure(429, """{"error":"Slow down."}""")
        assertEquals(FeedFailureKind.LIMITED, limited.kind)
        val transport = FeedCodec.failure(0, "")
        assertEquals(FeedCopy.TRANSPORT, transport.message)
        val home = FeedCodec.home(401, """{"error":"Sign in to browse."}""")
        assertEquals("Sign in to browse.", (home as FeedCall.Err).failure.message)
    }

    @Test
    fun unreadablePayloadsDoNotBecomePosts() {
        val home = FeedCodec.home(200, """{"ok":true}""")
        assertEquals(FeedCopy.UNREADABLE, (home as FeedCall.Err).failure.message)
        val list = FeedCodec.postList(200, """{"error":"nope"}""")
        assertTrue(list is FeedCall.Err)
        val broken = FeedCodec.postList(200, "not-json")
        assertTrue(broken is FeedCall.Err)
    }

    @Test
    fun mediaPathsStayOnApiMediaKeys() {
        assertEquals(imageKey, PostMediaRef.keyFromPath("/api/media/$imageKey"))
        assertEquals(imageKey, PostMediaRef.keyFromPath("/api/media/$imageKey?x=1"))
        assertNull(PostMediaRef.keyFromPath("https://1an0ys2lfxtqqmvt.public.blob.vercel-storage.com/$imageKey"))
        assertNull(PostMediaRef.keyFromPath("/api/message-media/$imageKey"))
        assertNull(PostMediaRef.keyFromPath("/api/media/not-a-key"))
        assertNull(PostMediaRef.keyFromPath("//evil.example/$imageKey"))
        val post = (FeedCodec.postList(200, "[${postJson(id = "p-bad", media = """["https://evil.example/a","/api/message-media/msg","/api/media/$imageKey"]""")}]") as FeedCall.Ok).value.single()
        assertNull(post.media[0].key)
        assertNull(post.media[1].key)
        assertEquals(imageKey, post.media[2].key)
    }

    @Test
    fun feedUrlsMatchTheExistingRoutes() {
        assertEquals("$origin/api/social", ApiRoutes.homeFeed(origin))
        assertEquals("$origin/api/social?offset=40", ApiRoutes.feedOffset(origin, 40))
        assertEquals("$origin/api/social?offset=0", ApiRoutes.feedOffset(origin, -5))
        assertEquals("$origin/api/social?offset=10000", ApiRoutes.feedOffset(origin, 99_999))
        assertEquals("$origin/api/social?following=1&offset=0", ApiRoutes.followingFeed(origin, 0))
        assertEquals("$origin/api/social?post=post-1", ApiRoutes.singlePost(origin, "post-1"))
        assertEquals(
            "$origin/api/social?comments=post-1&limit=30&cursor=1700000000000%2Cc1",
            ApiRoutes.postComments(origin, "post-1", cursor = "1700000000000,c1"),
        )
        assertEquals("$origin/api/social?reels=1&offset=20", ApiRoutes.reelsFeed(origin, 20))
        assertEquals("$origin/api/media/$imageKey", ApiRoutes.publicMedia(origin, imageKey))
    }

    @Test
    fun homeColumnDropsStoriesAndReelsWhileTrayHonorsFlags() {
        val posts = listOf(
            sample("post-1", "post", "u1"),
            sample("reel-1", "reel", "u1"),
            sample("story-live", "story", "u2", expiresAt = 5_000),
            sample("story-dead", "story", "u3", expiresAt = 1_000),
        )
        assertEquals(listOf("post-1"), FeedDerive.columnPosts(posts).map { it.id })
        val shown = FeedDerive.stories(posts, storiesFlag = true, settingsEnabled = true, nowEpochMillis = 2_000)
        assertEquals(listOf("story-live"), shown.map { it.id })
        assertTrue(FeedDerive.stories(posts, storiesFlag = false, settingsEnabled = true, nowEpochMillis = 2_000).isEmpty())
        assertTrue(FeedDerive.stories(posts, storiesFlag = true, settingsEnabled = false, nowEpochMillis = 2_000).isEmpty())
        val settings = com.functiongram.app.data.feed.StorySettings(enabled = true, tray = true)
        assertTrue(FeedDerive.showTray(true, settings, shown))
        assertFalse(FeedDerive.showTray(true, settings.copy(tray = false), shown))
    }

    @Test
    fun pagingDedupesAndFullPagesMeanMore() {
        val first = listOf(sample("a", "post", "u1"), sample("b", "post", "u1"))
        val more = listOf(sample("b", "post", "u1"), sample("c", "post", "u1"))
        assertEquals(listOf("a", "b", "c"), FeedPaging.append(first, more).map { it.id })
        assertTrue(FeedPaging.offsetHasMore(40))
        assertFalse(FeedPaging.offsetHasMore(8))
        assertTrue(FeedPaging.reelsHasMore(20))
        assertFalse(FeedPaging.reelsHasMore(2))
    }

    @Test
    fun reelsPlaylistKeepsVideosNewestFirst() {
        val page = listOf(sample("old", "reel", "u1", createdAt = 10, mediaType = "video"))
        val extras = listOf(
            sample("photo", "post", "u1", createdAt = 99, mediaType = "image"),
            sample("new", "post", "u2", createdAt = 20, mediaType = "video"),
            sample("old", "reel", "u1", createdAt = 10, mediaType = "video"),
        )
        assertEquals(listOf("new", "old"), FeedDerive.reelsPlaylist(page, extras).map { it.id })
    }

    @Test
    fun storyOrderAndGesturesMatchTheWebsite() {
        val items = listOf(
            sample("s2", "story", "ada", createdAt = 20),
            sample("s1", "story", "ada", createdAt = 10),
            sample("m1", "story", "me", createdAt = 15),
            sample("b1", "story", "bea", createdAt = 30),
        )
        val groups = StoryPlayback.orderGroups(StoryPlayback.groupByAuthor(items), "me")
        assertEquals(listOf("me", "ada", "bea"), groups.map { it.first().authorId })
        assertEquals(listOf("s1", "s2"), groups[1].map { it.id })
        val lengths = groups.map { it.size }
        val start = StoryPlayback.cursorForAuthor(groups.map { it.first().authorId }, "ada")
        assertEquals(1, start.author)
        val nextAuthor = StoryPlayback.stepSegment(lengths, com.functiongram.app.data.feed.StoryCursor(1, 1), 1)
        assertEquals(2, nextAuthor?.author)
        assertEquals(0, nextAuthor?.segment)
        assertNull(StoryPlayback.stepSegment(lengths, com.functiongram.app.data.feed.StoryCursor(2, 0), 1))
        val back = StoryPlayback.stepSegment(lengths, com.functiongram.app.data.feed.StoryCursor(1, 0), -1)
        assertEquals(0, back?.author)
        assertEquals(0, back?.segment)
        val stay = StoryPlayback.stepSegment(lengths, com.functiongram.app.data.feed.StoryCursor(0, 0), -1)
        assertEquals(0, stay?.author)
        assertEquals(0, stay?.segment)
        assertNull(StoryPlayback.stepAuthor(lengths, com.functiongram.app.data.feed.StoryCursor(2, 0), 1))
        assertTrue(StoryPlayback.classify(0, 0f, 0f, 0.2f) is StoryGesture.Tap)
        assertEquals("left", (StoryPlayback.classify(0, 0f, 0f, 0.2f) as StoryGesture.Tap).side)
        assertEquals("right", (StoryPlayback.classify(10, 0f, 0f, 0.8f) as StoryGesture.Tap).side)
        assertTrue(StoryPlayback.classify(200, 10f, 0f, 0.5f) is StoryGesture.Hold)
        assertEquals("next", (StoryPlayback.classify(50, -60f, 4f, 0.5f) as StoryGesture.Swipe).direction)
        assertEquals("prev", (StoryPlayback.classify(50, 60f, 4f, 0.5f) as StoryGesture.Swipe).direction)
    }

    @Test
    fun timestampsUseTheZonePassedIn() {
        val formatted = FeedTime.format(1_700_000_000_000L, ZoneId.of("Asia/Kolkata"))
        assertEquals("15 Nov, 03:43", formatted)
        assertEquals("", FeedTime.format(0, ZoneId.of("Asia/Kolkata")))
    }

    @Test
    fun imageCacheDropsTheLeastRecentlyUsedBytes() {
        val cache = FeedMediaCache(maxBytes = 10)
        cache.put("a", ByteArray(6))
        cache.put("b", ByteArray(6))
        assertNull(cache.get("a"))
        assertEquals(6, cache.get("b")?.size)
        cache.put("huge", ByteArray(11))
        assertNull(cache.get("huge"))
        assertEquals(6, cache.sizeBytes())
    }

    @Test
    fun likedFlagsAcceptZeroOneAndPreviewJsonString() {
        val raw = postJson(id = "p-flags").replace("\"liked\":1", "\"liked\":0").replace(
            """"comment_preview":{"body":"nice","username":"bea"}""",
            """"comment_preview":"{\"body\":\"via string\",\"username\":\"cy\"}"""",
        )
        val post = (FeedCodec.postList(200, "[$raw]") as FeedCall.Ok).value.single()
        assertFalse(post.liked)
        assertEquals("via string", post.commentPreview?.body)
        assertEquals("cy", post.commentPreview?.username)
    }

    private fun homeJson(): String = """
        {
          "features":{"stories":true,"reels":false,"follow":true,"comments":true,"likes":true,"saves":false},
          "stories":{"enabled":true,"hours":24,"photoSeconds":5,"videoMaxSeconds":15,"tray":true,"ring":true},
          "me":{"id":"viewer-1","username":"me","name":"Me","avatar":"","bio":"","is_demo":0,"is_private":0},
          "people":[],
          "posts":[
            ${postJson(id = "p1")},
            ${postJson(id = "p2", likes = "null", preview = "null")},
            ${postJson(id = "story-1", kind = "story", expires = "1800000000000", media = """["/api/media/$imageKey"]""")}
          ],
          "notifications":[],
          "unreadMessages":0,
          "hasMore":false
        }
    """.trimIndent()

    private fun postJson(
        id: String,
        kind: String = "post",
        expires: String = "null",
        media: String = """["/api/media/$imageKey","/api/media/$imageKey2","/api/media/$imageKey3"]""",
        likes: String = "4",
        preview: String = """{"body":"nice","username":"bea"}""",
    ): String = """
        {
          "id":"$id",
          "author_id":"u1",
          "media":$media,
          "aspects":[0.8,1,1.2],
          "media_options":[{"ratio":"4:5","fit":"cover","alt":"hill"},{"ratio":"1:1","fit":"contain","alt":""},{"ratio":"original","fit":"contain","alt":""}],
          "media_type":"image",
          "kind":"$kind",
          "caption":"caption",
          "location":"Goa",
          "category":"Travel",
          "created_at":1700000000000,
          "expires_at":$expires,
          "likes":3,
          "liked":1,
          "saved":0,
          "seen":0,
          "comment_count":2,
          "comment_preview":$preview,
          "display_likes":$likes,
          "display_comments":2,
          "display_views":9,
          "reel_credit":"",
          "highlighted":false,
          "author":{"id":"u1","username":"ada","name":"Ada","avatar":"/api/media/$imageKey","bio":"","is_demo":0,"is_private":0}
        }
    """.trimIndent()

    private fun sample(
        id: String,
        kind: String,
        authorId: String,
        expiresAt: Long? = null,
        createdAt: Long = 1,
        mediaType: String = "image",
    ) = FeedPost(
        id = id,
        authorId = authorId,
        author = com.functiongram.app.data.feed.FeedAuthor(authorId, authorId, authorId, ""),
        media = emptyList(),
        mediaType = mediaType,
        kind = kind,
        caption = "",
        location = "",
        category = "",
        createdAt = createdAt,
        expiresAt = expiresAt,
        likes = 0,
        liked = false,
        saved = false,
        seen = false,
        commentCount = 0,
        commentPreview = null,
        displayLikes = null,
        displayComments = null,
        displayViews = null,
        reelCredit = "",
        highlighted = false,
    )
}
