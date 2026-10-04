package com.functiongram.app.directory

import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.data.directory.DirectoryCodec
import com.functiongram.app.data.directory.DirectoryCopy
import com.functiongram.app.data.directory.DirectoryDerive
import com.functiongram.app.data.directory.DirectoryRequests
import com.functiongram.app.data.directory.ProfilePaths
import com.functiongram.app.data.directory.ProfileTab
import com.functiongram.app.data.directory.ThemeChoice
import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedFailureKind
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.remote.ApiRoutes
import com.functiongram.app.security.ClientSecretPolicy
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DirectoryMappingTest {
    private val origin = ApiEnvironment.PUBLIC_API_ORIGIN
    private val imageKey = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

    @Test
    fun usernameRoutesAreNotAGenericProfilePath() {
        assertEquals("/ada", ProfilePaths.linkPath("ada"))
        assertEquals("/ada_l", ProfilePaths.linkPath("ada_l"))
        assertEquals("/#/profile/api", ProfilePaths.linkPath("api"))
        assertEquals("/#/profile/Admin-Panel", ProfilePaths.linkPath("Admin-Panel"))
        assertEquals("", ProfilePaths.linkPath(""))
        assertEquals("", ProfilePaths.linkPath("a/b"))
        assertNull(ProfilePaths.usernameError("ada_l"))
        assertEquals(DirectoryCopy.USERNAME_RULE, ProfilePaths.usernameError("ab"))
        assertEquals(DirectoryCopy.USERNAME_RULE, ProfilePaths.usernameError("Ada Bad"))
        assertEquals(DirectoryCopy.USERNAME_RESERVED, ProfilePaths.usernameError("API"))
        assertFalse(ProfilePaths.linkPath("ada").startsWith("/profile"))
        assertFalse(ClientSecretPolicy.containsBackendSecret(ProfilePaths.linkPath("ada")))
    }

    @Test
    fun personAndShellMapFlagsAndNumericBooleans() {
        val person = (DirectoryCodec.person(200, personJson(privateAccount = 1, followed = 0, blocked = 1, demo = 0)) as FeedCall.Ok).value!!
        assertEquals("ada", person.username)
        assertTrue(person.privateAccount)
        assertFalse(person.followed)
        assertTrue(person.blocked)
        assertFalse(person.demo)
        assertEquals(imageKey, com.functiongram.app.data.feed.PostMediaRef.keyFromPath(person.avatarPath))
        assertEquals(4, person.followers)
        assertNull((DirectoryCodec.person(200, "null") as FeedCall.Ok).value)
        val missing = DirectoryCodec.person(401, """{"error":"Sign in to join the conversation."}""") as FeedCall.Err
        assertEquals(FeedFailureKind.SIGN_IN, missing.failure.kind)
        assertEquals(DirectoryCopy.SIGN_IN, missing.failure.message)
        val required = DirectoryCodec.person(400, """{"error":"Please complete the required fields."}""") as FeedCall.Err
        assertEquals(DirectoryCopy.REQUIRED, required.failure.message)

        val shell = (DirectoryCodec.shell(200, """{"features":{"search":true,"notifications":0,"privateAccounts":true,"follow":true,"saves":false,"reels":1,"reports":true,"messages":true,"comments":true},"me":${personJson()},"posts":[]}""") as FeedCall.Ok).value
        assertTrue(shell.flags.search)
        assertFalse(shell.flags.notifications)
        assertTrue(shell.flags.privateAccounts)
        assertTrue(shell.flags.reels)
        assertFalse(shell.flags.uploads)
        assertEquals("ada", shell.me?.username)
        val off = (DirectoryCodec.shell(200, """{"posts":[]}""") as FeedCall.Ok).value
        assertFalse(off.flags.search)
        assertNull(off.me)
        val down = DirectoryCodec.shell(503, """{"error":"We’ll be back soon"}""") as FeedCall.Err
        assertEquals(FeedFailureKind.UNAVAILABLE, down.failure.kind)
        assertEquals("We’ll be back soon", down.failure.message)
    }

    @Test
    fun searchMapsPeopleAndPostsAndRefusals() {
        val body = """{"people":[${personJson()}],"posts":[${postJson()}]}"""
        val page = (DirectoryCodec.search(200, body) as FeedCall.Ok).value
        assertEquals("ada", page.people.single().username)
        assertEquals("post-1", page.posts.single().id)
        assertEquals(imageKey, page.posts.single().media.single().key)
        val empty = (DirectoryCodec.search(200, """{"people":[],"posts":[]}""") as FeedCall.Ok).value
        assertTrue(empty.people.isEmpty())
        assertTrue(empty.posts.isEmpty())
        val blocked = DirectoryCodec.search(403, """{"error":"This feature is currently unavailable."}""") as FeedCall.Err
        assertEquals(DirectoryCopy.FEATURE_OFF, blocked.failure.message)
        val long = "a".repeat(81)
        try {
            ApiRoutes.search(origin, long)
            throw AssertionError("expected rejection")
        } catch (error: IllegalArgumentException) {
            assertEquals(DirectoryCopy.LENGTH, error.message)
        }
        assertEquals(
            "https://functiongram.vercel.app/api/social?search=ada%20lane",
            ApiRoutes.search(origin, "ada lane"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?person=ada",
            ApiRoutes.person(origin, "ada"),
        )
        assertEquals(
            "https://functiongram.vercel.app/api/social?profile=user-1",
            ApiRoutes.profilePosts(origin, "user-1"),
        )
        assertFalse(ApiRoutes.profilePosts(origin, "user-1").contains("/profile/"))
    }

    @Test
    fun notificationsGroupAndKeepServerCopy() {
        val media = """["/api/media/$imageKey"]"""
        val body = """{"results":[
            ${note("n1", "like", "post-1", null, "liked your post", null)},
            ${note("n2", "like", "post-1", null, "liked your post", null)},
            ${note("n3", "like", "post-1", null, "liked your post", null)},
            ${note("n4", "like", "post-1", 5, "liked your post", null)},
            ${note("n5", "broadcast", null, null, "sent you an announcement", "Hello from the desk", "b1")},
            ${note("n6", "comment", "post-2", null, "commented", "Nice photo")}
        ]}"""
        val items = (DirectoryCodec.notifications(200, body.replace("\$media", media)) as FeedCall.Ok).value
        assertEquals(6, items.size)
        assertEquals("/api/media/$imageKey", items.first().mediaPath)
        assertEquals("Nice photo", DirectoryDerive.notificationLabel(items.last()))
        assertEquals("liked your post", DirectoryDerive.notificationLabel(items.first()))
        val groups = DirectoryDerive.groups(items)
        assertEquals(4, groups.size)
        assertEquals(3, groups[0].actors.size)
        assertTrue(groups[0].unread)
        assertEquals(1, groups[1].actors.size)
        assertFalse(groups[1].unread)
        assertEquals("broadcast:b1", groups[2].key)
        assertEquals("Hello from the desk", DirectoryDerive.notificationLabel(groups[2].actors.single()))
        val likes = DirectoryDerive.visibleGroups(groups, "like")
        assertEquals(2, likes.size)
        val signedOut = DirectoryCodec.notifications(401, """{"error":"Sign in to join the conversation."}""") as FeedCall.Err
        assertEquals(FeedFailureKind.SIGN_IN, signedOut.failure.kind)
    }

    @Test
    fun discoverDropsSampleAccountsAndSearchNeedsTwoCharacters() {
        val me = person("me", "me")
        val sample = person("sample", "sample", demo = true)
        val other = person("other", "bee")
        val shown = DirectoryDerive.discover(listOf(me, sample, other), "me")
        assertEquals(listOf("other"), shown.map { it.id })
        assertNull(DirectoryDerive.searchNeedle(" a "))
        assertEquals("ada", DirectoryDerive.searchNeedle("@ada"))
        assertEquals(listOf("ada", "bee"), DirectoryDerive.rememberRecent(listOf("bee", "Ada"), "ada"))
        assertEquals(listOf("bee"), DirectoryDerive.forgetRecent(listOf("ada", "bee"), "ada"))
    }

    @Test
    fun profileGridFollowsTheWebsiteTabs() {
        val posts = listOf(
            post("p", "user-1", "post", "image", false),
            post("r", "user-1", "reel", "video", false),
            post("s", "user-1", "story", "image", false),
            post("o", "user-2", "post", "image", true),
        )
        assertEquals(listOf("p"), DirectoryDerive.profileGrid(posts, "user-1", ProfileTab.POSTS).map { it.id })
        assertEquals(listOf("r"), DirectoryDerive.profileGrid(posts, "user-1", ProfileTab.REELS).map { it.id })
        assertEquals(listOf("o"), DirectoryDerive.profileGrid(posts, "user-1", ProfileTab.SAVED).map { it.id })
    }

    @Test
    fun settingsWritesMatchTheExistingActions() {
        val privacy = Json.parseToJsonElement(DirectoryRequests.setPrivacy(true)).jsonObject
        assertEquals("set_privacy", privacy.getValue("action").jsonPrimitive.content)
        assertEquals("true", privacy.getValue("private").jsonPrimitive.content)
        val parsed = (DirectoryCodec.privacy(200, """{"ok":true,"private":false}""") as FeedCall.Ok).value
        assertFalse(parsed.privateAccount)
        val read = Json.parseToJsonElement(DirectoryRequests.readNotifications()).jsonObject
        assertEquals("read_notifications", read.getValue("action").jsonPrimitive.content)
        val profile = Json.parseToJsonElement(
            DirectoryRequests.updateProfile("Ada", "Ada Lovelace", "bio", "https://example.com", "/api/media/$imageKey"),
        ).jsonObject
        assertEquals("ada", profile.getValue("username").jsonPrimitive.content)
        assertEquals("profile", profile.getValue("action").jsonPrimitive.content)
        try {
            DirectoryRequests.updateProfile("api", "Ada", "", "", "")
            throw AssertionError("reserved")
        } catch (error: IllegalArgumentException) {
            assertEquals(DirectoryCopy.USERNAME_RESERVED, error.message)
        }
        try {
            DirectoryRequests.updateProfile("ada", "Ada", "", "javascript:alert(1)", "")
            throw AssertionError("website")
        } catch (error: IllegalArgumentException) {
            assertEquals(DirectoryCopy.WEBSITE_COMPLETE, error.message)
        }
        val follow = Json.parseToJsonElement(DirectoryRequests.follow("user-2", false)).jsonObject
        assertEquals("follow", follow.getValue("action").jsonPrimitive.content)
        assertEquals("false", follow.getValue("active").jsonPrimitive.content)
        assertEquals("block", Json.parseToJsonElement(DirectoryRequests.block("user-2")).jsonObject.getValue("action").jsonPrimitive.content)
        val report = Json.parseToJsonElement(DirectoryRequests.reportProfile("user-2", "user-1", "spam", "")).jsonObject
        assertEquals("profile", report.getValue("target_type").jsonPrimitive.content)
        assertEquals("spam", report.getValue("reason").jsonPrimitive.content)
        try {
            DirectoryRequests.reportProfile("user-1", "user-1", "spam", "")
            throw AssertionError("self")
        } catch (error: IllegalArgumentException) {
            assertEquals("You cannot report your own profile.", error.message)
        }
        val collection = (DirectoryCodec.collections(
            200,
            """[{"id":"c1","name":"Trips","created_at":10,"post_ids":"[\"p1\"]"}]""",
        ) as FeedCall.Ok).value.single()
        assertEquals(listOf("p1"), collection.postIds)
        val created = (DirectoryCodec.collectionWrite(200, """{"id":"c1","existing":true}""") as FeedCall.Ok).value
        assertTrue(created.existing)
        val refused = DirectoryCodec.acknowledged(403, """{"error":"This feature is currently unavailable."}""") as FeedCall.Err
        assertEquals(DirectoryCopy.FEATURE_OFF, refused.failure.message)
        assertEquals(
            "https://functiongram.vercel.app/api/social?relations=user-1&kind=followers",
            ApiRoutes.relations(origin, "user-1", "followers"),
        )
        val badRelation = DirectoryCodec.people(400, """{"error":"Invalid relationship."}""") as FeedCall.Err
        assertEquals(DirectoryCopy.RELATIONSHIP, badRelation.failure.message)
    }

    @Test
    fun accountEmailAndDeletionUseBetterAuthPaths() {
        val email = Json.parseToJsonElement(DirectoryRequests.changeEmail("person@example.com")).jsonObject
        assertEquals("person@example.com", email.getValue("newEmail").jsonPrimitive.content)
        assertEquals("/verify-email?changed=1", email.getValue("callbackURL").jsonPrimitive.content)
        assertEquals("https://functiongram.vercel.app/api/auth/change-email", ApiRoutes.changeEmail(origin))
        val delete = Json.parseToJsonElement(DirectoryRequests.deleteAccount()).jsonObject
        assertEquals("/verify-email?deleted=1", delete.getValue("callbackURL").jsonPrimitive.content)
        assertEquals("https://functiongram.vercel.app/api/auth/delete-user", ApiRoutes.deleteUser(origin))
        val accepted = DirectoryCodec.acknowledged(200, """{"status":true}""")
        assertTrue(accepted is FeedCall.Ok)
        val limited = DirectoryCodec.acknowledged(429, """{"message":"Please wait a minute before trying again."}""") as FeedCall.Err
        assertEquals(FeedFailureKind.LIMITED, limited.failure.kind)
        assertEquals("Please wait a minute before trying again.", limited.failure.message)
        assertFalse(ClientSecretPolicy.containsBackendSecret(DirectoryRequests.changeEmail("person@example.com")))
        assertFalse(ClientSecretPolicy.containsBackendSecret(DirectoryRequests.deleteAccount()))
    }

    @Test
    fun themeChoiceStaysOnTheDevice() {
        assertEquals(ThemeChoice.SYSTEM, ThemeChoice.fromStored(null))
        assertEquals(ThemeChoice.SYSTEM, ThemeChoice.fromStored("nope"))
        assertEquals(ThemeChoice.DARK, ThemeChoice.fromStored("dark"))
        assertFalse(ThemeChoice.isDark(ThemeChoice.LIGHT, systemDark = true))
        assertTrue(ThemeChoice.isDark(ThemeChoice.DARK, systemDark = false))
        assertTrue(ThemeChoice.isDark(ThemeChoice.SYSTEM, systemDark = true))
        assertEquals("system", ThemeChoice.stored(ThemeChoice.SYSTEM))
    }

    private fun person(id: String, username: String, demo: Boolean = false) =
        com.functiongram.app.data.directory.DirectoryPerson(
            id = id,
            username = username,
            name = username,
            bio = "",
            website = "",
            avatarPath = "",
            demo = demo,
            privateAccount = false,
            verified = false,
            followers = 0,
            following = 0,
            postCount = 0,
            followed = false,
            blocked = false,
        )

    private fun post(id: String, authorId: String, kind: String, mediaType: String, saved: Boolean) = FeedPost(
        id = id,
        authorId = authorId,
        author = com.functiongram.app.data.feed.FeedAuthor(authorId, "ada", "Ada", ""),
        media = emptyList(),
        mediaType = mediaType,
        kind = kind,
        caption = "",
        location = "",
        category = "For you",
        createdAt = 10,
        expiresAt = null,
        likes = 0,
        liked = false,
        saved = saved,
        seen = false,
        commentCount = 0,
        commentPreview = null,
        displayLikes = null,
        displayComments = null,
        displayViews = null,
        reelCredit = "",
        highlighted = false,
    )

    private fun personJson(
        privateAccount: Int = 0,
        followed: Int = 1,
        blocked: Int = 0,
        demo: Int = 0,
    ) = """{"id":"user-1","username":"ada","name":"Ada","bio":"hello","website":"https://example.com","avatar":"/api/media/$imageKey","is_demo":$demo,"is_private":$privateAccount,"verified":0,"followers":4,"following":1,"post_count":2,"followed":$followed,"blocked":$blocked}"""

    private fun postJson() = """{"id":"post-1","author_id":"user-1","username":"ada","name":"Ada","avatar":"","media":["/api/media/$imageKey"],"media_type":"image","kind":"post","caption":"hill","created_at":10,"likes":1,"liked":0,"saved":0,"seen":0,"comment_count":0}"""

    private fun note(
        id: String,
        kind: String,
        postId: String?,
        readAt: Int?,
        template: String,
        message: String?,
        broadcast: String? = null,
    ): String {
        val post = if (postId == null) "null" else "\"$postId\""
        val read = readAt?.toString() ?: "null"
        val text = if (message == null) "null" else "\"$message\""
        val cast = if (broadcast == null) "null" else "\"$broadcast\""
        val media = if (postId == null) "null" else """"[\"/api/media/$imageKey\"]""""
        return """{"id":"$id","actor_id":"actor-1","kind":"$kind","post_id":$post,"created_at":100,"read_at":$read,"username":"ada","avatar":"","media":$media,"template_text":"$template","message_text":$text,"broadcast_id":$cast}"""
    }
}
