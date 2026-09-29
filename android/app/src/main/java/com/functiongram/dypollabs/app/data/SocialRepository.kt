package com.functiongram.dypollabs.app.data

import android.util.Log
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import org.json.JSONObject
import retrofit2.Response

class SocialRepository(
    private val sessionManager: SessionManager
) {
    private val gson = Gson()

    private fun getService(): SocialApiService {
        val baseUrl = sessionManager.getBaseUrlSync()
        return ApiClient.createSocialService(baseUrl, sessionManager)
    }

    suspend fun getBootstrap(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getBootstrap()
            handleResponse(response)
        } catch (e: Exception) {
            Log.e("SocialRepository", "Bootstrap error", e)
            Result.failure(e)
        }
    }

    suspend fun getFeed(offset: Int = 0, category: String? = null): Result<String> = withContext(Dispatchers.IO) {
        try {
            val service = getService()
            val response = if (category != null && category != "For you") {
                service.getFeed(offset = offset, category = category)
            } else {
                service.getFeed(offset = offset)
            }
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getReels(offset: Int = 0): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getFeed(offset = offset, reels = "1")
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getExplore(category: String = "For you", offset: Int = 0): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getFeed(offset = offset, explore = "1", category = category)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getFollowing(offset: Int = 0): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getFeed(offset = offset, following = "1")
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getProfilePosts(authorId: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getFeed(profile = authorId)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getComments(postId: String, cursor: String? = null): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getComments(postId = postId, cursor = cursor)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getInbox(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getInbox()
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getMessages(otherId: String, cursor: String? = null): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getMessages(otherId = otherId, cursor = cursor)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getPerson(personId: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getPerson(personId)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getActivity(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getActivity()
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getUploadPolicy(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().getUploadPolicy()
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun search(term: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = getService().search(term)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun performAction(action: String, id: String? = null, extra: Map<String, Any> = emptyMap()): Result<String> = withContext(Dispatchers.IO) {
        try {
            val body = mutableMapOf<String, Any>("action" to action)
            if (id != null) body["id"] = id
            body.putAll(extra)
            val response = getService().performAction(body)
            handleResponse(response)
        } catch (e: Exception) {
            Log.e("SocialRepository", "Action $action failed", e)
            Result.failure(e)
        }
    }

    suspend fun likePost(postId: String, active: Boolean): Result<String> {
        return performAction("reaction", postId, mapOf("kind" to "like", "active" to active))
    }

    suspend fun savePost(postId: String, active: Boolean): Result<String> {
        return performAction("reaction", postId, mapOf("kind" to "save", "active" to active))
    }

    suspend fun followUser(userId: String): Result<String> {
        return performAction("follow", userId)
    }

    suspend fun commentPost(postId: String, body: String): Result<String> {
        return performAction("comment", postId, mapOf("body" to body))
    }

    suspend fun createPost(
        media: List<String>,
        caption: String,
        kind: String = "post",
        location: String = "",
        category: String = "For you"
    ): Result<String> {
        return performAction(
            "create_post",
            extra = mapOf(
                "media" to media,
                "caption" to caption,
                "kind" to kind,
                "location" to location,
                "category" to category
            )
        )
    }

    suspend fun sendMessage(recipientId: String, body: String, postId: String? = null): Result<String> {
        val extra = mutableMapOf<String, Any>("body" to body)
        if (postId != null) extra["post_id"] = postId
        return performAction("message", recipientId, extra)
    }

    private fun handleResponse(response: Response<ResponseBody>): Result<String> {
        return try {
            val bodyString = response.body()?.string() ?: response.errorBody()?.string() ?: ""
            if (response.isSuccessful) {
                Result.success(bodyString)
            } else {
                try {
                    val json = JSONObject(bodyString)
                    val error = json.optString("error", "Unknown error")
                    Result.failure(Exception(error))
                } catch (e: Exception) {
                    Result.failure(Exception("Error ${response.code()}: $bodyString"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
