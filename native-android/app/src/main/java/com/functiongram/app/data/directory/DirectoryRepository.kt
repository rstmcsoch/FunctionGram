package com.functiongram.app.data.directory

import com.functiongram.app.data.feed.FeedCall
import com.functiongram.app.data.feed.FeedCodec
import com.functiongram.app.data.feed.FeedCopy
import com.functiongram.app.data.feed.FeedFailure
import com.functiongram.app.data.feed.FeedPost
import com.functiongram.app.data.remote.ApiRoutes
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Profiles, search, notifications, and account settings on the existing HTTPS API.
 * Session cookies come from the shared client. No database driver is created here.
 */
interface DirectoryRepository {
    fun loadShell(): FeedCall<AccountShell>
    fun loadPerson(idOrUsername: String): FeedCall<DirectoryPerson?>
    fun loadProfilePosts(authorId: String): FeedCall<List<FeedPost>>
    fun loadSaved(): FeedCall<List<FeedPost>>
    fun search(term: String): FeedCall<SearchPage>
    fun loadPeople(limit: Int = 40): FeedCall<List<DirectoryPerson>>
    fun loadNotifications(): FeedCall<List<AppNotification>>
    fun markNotificationsRead(): FeedCall<Unit>
    fun loadRelations(id: String, kind: String): FeedCall<List<DirectoryPerson>>
    fun setPrivacy(privateAccount: Boolean): FeedCall<PrivacyResult>
    fun updateProfile(username: String, name: String, bio: String, website: String, avatar: String): FeedCall<Unit>
    fun follow(id: String, active: Boolean): FeedCall<Unit>
    fun block(id: String): FeedCall<Unit>
    fun unblock(id: String): FeedCall<Unit>
    fun reportProfile(targetId: String, viewerId: String, reason: String, details: String): FeedCall<Unit>
    fun loadCollections(): FeedCall<List<SavedCollection>>
    fun createCollection(name: String): FeedCall<CollectionWrite>
    fun deleteCollection(id: String): FeedCall<Unit>
    fun requestEmailChange(address: String): FeedCall<Unit>
    fun requestAccountDeletion(): FeedCall<Unit>
}

class OkHttpDirectoryRepository(
    private val origin: String,
    client: OkHttpClient,
) : DirectoryRepository {
    private val http = client.newBuilder()
        .callTimeout(60, TimeUnit.SECONDS)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    override fun loadShell(): FeedCall<AccountShell> = DirectoryCodec.shell(get(ApiRoutes.social(origin)))

    override fun loadPerson(idOrUsername: String): FeedCall<DirectoryPerson?> =
        call(idOrUsername) { ApiRoutes.person(origin, it) }.let { raw -> DirectoryCodec.person(raw.status, raw.text) }

    override fun loadProfilePosts(authorId: String): FeedCall<List<FeedPost>> =
        call(authorId) { ApiRoutes.profilePosts(origin, it) }.let { raw -> DirectoryCodec.posts(raw.status, raw.text) }

    override fun loadSaved(): FeedCall<List<FeedPost>> = DirectoryCodec.posts(get(ApiRoutes.savedPosts(origin)))

    override fun search(term: String): FeedCall<SearchPage> {
        val url = try {
            ApiRoutes.search(origin, term)
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        val raw = get(url)
        return DirectoryCodec.search(raw.status, raw.text)
    }

    override fun loadPeople(limit: Int): FeedCall<List<DirectoryPerson>> =
        DirectoryCodec.people(get(ApiRoutes.people(origin, limit)))

    override fun loadNotifications(): FeedCall<List<AppNotification>> =
        DirectoryCodec.notifications(get(ApiRoutes.notifications(origin)))

    override fun markNotificationsRead(): FeedCall<Unit> =
        DirectoryCodec.acknowledged(post(ApiRoutes.social(origin), DirectoryRequests.readNotifications()))

    override fun loadRelations(id: String, kind: String): FeedCall<List<DirectoryPerson>> {
        val url = try {
            ApiRoutes.relations(origin, id, kind)
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return DirectoryCodec.people(get(url))
    }

    override fun setPrivacy(privateAccount: Boolean): FeedCall<PrivacyResult> =
        DirectoryCodec.privacy(post(ApiRoutes.social(origin), DirectoryRequests.setPrivacy(privateAccount)))

    override fun updateProfile(
        username: String,
        name: String,
        bio: String,
        website: String,
        avatar: String,
    ): FeedCall<Unit> {
        val payload = try {
            DirectoryRequests.updateProfile(username, name, bio, website, avatar)
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return DirectoryCodec.acknowledged(post(ApiRoutes.social(origin), payload))
    }

    override fun follow(id: String, active: Boolean): FeedCall<Unit> = postAction {
        DirectoryRequests.follow(id, active)
    }

    override fun block(id: String): FeedCall<Unit> = postAction { DirectoryRequests.block(id) }

    override fun unblock(id: String): FeedCall<Unit> = postAction { DirectoryRequests.unblock(id) }

    override fun reportProfile(targetId: String, viewerId: String, reason: String, details: String): FeedCall<Unit> =
        postAction { DirectoryRequests.reportProfile(targetId, viewerId, reason, details) }

    override fun loadCollections(): FeedCall<List<SavedCollection>> =
        DirectoryCodec.collections(get(ApiRoutes.collections(origin)))

    override fun createCollection(name: String): FeedCall<CollectionWrite> {
        val payload = try {
            DirectoryRequests.createCollection(name)
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return DirectoryCodec.collectionWrite(post(ApiRoutes.social(origin), payload))
    }

    override fun deleteCollection(id: String): FeedCall<Unit> = postAction { DirectoryRequests.deleteCollection(id) }

    override fun requestEmailChange(address: String): FeedCall<Unit> {
        val payload = try {
            DirectoryRequests.changeEmail(address)
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return DirectoryCodec.acknowledged(post(ApiRoutes.changeEmail(origin), payload))
    }

    override fun requestAccountDeletion(): FeedCall<Unit> =
        DirectoryCodec.acknowledged(post(ApiRoutes.deleteUser(origin), DirectoryRequests.deleteAccount()))

    private fun postAction(payload: () -> String): FeedCall<Unit> {
        val body = try {
            payload()
        } catch (error: IllegalArgumentException) {
            return FeedCall.Err(localRefusal(error))
        }
        return DirectoryCodec.acknowledged(post(ApiRoutes.social(origin), body))
    }

    private fun call(value: String, url: (String) -> String): RawHttp = try {
        get(url(value))
    } catch (error: IllegalArgumentException) {
        RawHttp(422, """{"error":${jsonString(error.message?.trim().orEmpty().ifBlank { DirectoryCopy.REQUIRED })}}""")
    }

    private fun get(url: String): RawHttp = execute(
        Request.Builder().url(url).header("User-Agent", USER_AGENT).get().build(),
    )

    private fun post(url: String, payload: String): RawHttp = execute(
        Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .post(payload.toRequestBody(JSON))
            .build(),
    )

    private fun execute(request: Request): RawHttp = try {
        http.newCall(request).execute().use { response ->
            val body = response.body
            val text = if (body == null) {
                ""
            } else {
                val bytes = body.bytes()
                if (bytes.size > MAX_JSON_BYTES) {
                    return RawHttp(413, """{"error":"${FeedCopy.GENERIC}"}""")
                }
                bytes.toString(Charsets.UTF_8)
            }
            RawHttp(response.code, text)
        }
    } catch (_: IOException) {
        RawHttp(0, "")
    }

    private fun localRefusal(error: IllegalArgumentException): FeedFailure =
        FeedCodec.failure(422, """{"error":${jsonString(error.message?.trim().orEmpty().ifBlank { DirectoryCopy.REQUIRED })}}""")

    private fun jsonString(value: String): String = buildString {
        append('"')
        value.forEach { char ->
            when (char) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                else -> append(char)
            }
        }
        append('"')
    }

    private data class RawHttp(val status: Int, val text: String)

    private fun DirectoryCodec.shell(raw: RawHttp) = shell(raw.status, raw.text)
    private fun DirectoryCodec.posts(raw: RawHttp) = posts(raw.status, raw.text)
    private fun DirectoryCodec.people(raw: RawHttp) = people(raw.status, raw.text)
    private fun DirectoryCodec.notifications(raw: RawHttp) = notifications(raw.status, raw.text)
    private fun DirectoryCodec.collections(raw: RawHttp) = collections(raw.status, raw.text)
    private fun DirectoryCodec.acknowledged(raw: RawHttp) = acknowledged(raw.status, raw.text)
    private fun DirectoryCodec.privacy(raw: RawHttp) = privacy(raw.status, raw.text)
    private fun DirectoryCodec.collectionWrite(raw: RawHttp) = collectionWrite(raw.status, raw.text)

    private companion object {
        const val USER_AGENT = "FunctionGram-Android"
        const val MAX_JSON_BYTES = 4 * 1024 * 1024
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
