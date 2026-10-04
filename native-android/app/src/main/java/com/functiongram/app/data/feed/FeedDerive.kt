package com.functiongram.app.data.feed

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Pure feed, story, and media rules. The website applies the same filters
 * to the bootstrap payload. No network and no sample posts.
 */
object PostMediaRef {
    private val KEY = Regex("^[a-f0-9-]{36}$")

    fun keyFromPath(path: String?): String? {
        if (path.isNullOrBlank()) return null
        val trimmed = path.trim()
        if ("://" in trimmed || trimmed.startsWith("//")) return null
        val bare = trimmed.substringBefore('?').substringBefore('#')
        val prefix = "/api/media/"
        if (!bare.startsWith(prefix)) return null
        val key = bare.removePrefix(prefix)
        if (key.length != 36 || !KEY.matches(key)) return null
        if ('/' in key || '\\' in key) return null
        return key
    }

    fun isKey(key: String): Boolean = key.length == 36 && KEY.matches(key) && '/' !in key
}

object FeedDerive {
    fun columnPosts(posts: List<FeedPost>): List<FeedPost> =
        posts.filter { it.kind != "story" && it.kind != "reel" }

    /**
     * Stories the home tray can show. Expired rows are omitted.
     * The feature flag and the story settings switch both have to be on.
     */
    fun stories(
        posts: List<FeedPost>,
        storiesFlag: Boolean,
        settingsEnabled: Boolean,
        nowEpochMillis: Long,
    ): List<FeedPost> {
        if (!storiesFlag || !settingsEnabled) return emptyList()
        return posts.filter { post ->
            post.kind == "story" && (post.expiresAt == null || post.expiresAt > nowEpochMillis)
        }
    }

    fun showTray(storiesFlag: Boolean, settings: StorySettings, stories: List<FeedPost>): Boolean =
        storiesFlag && settings.enabled && settings.tray && stories.isNotEmpty()

    fun reelsPlaylist(page: List<FeedPost>, extras: List<FeedPost>): List<FeedPost> {
        fun video(post: FeedPost) = post.mediaType == "video" && (post.kind == "reel" || post.kind == "post")
        val fromPage = page.filter(::video)
        val seen = fromPage.map { it.id }.toMutableSet()
        val extra = extras.filter { video(it) && seen.add(it.id) }
        return (fromPage + extra).sortedWith(
            compareByDescending<FeedPost> { it.createdAt }.thenByDescending { it.id },
        )
    }
}

object FeedPaging {
    const val OFFSET_PAGE = 40
    const val REELS_PAGE = 20

    fun append(existing: List<FeedPost>, incoming: List<FeedPost>): List<FeedPost> {
        val seen = existing.map { it.id }.toMutableSet()
        return existing + incoming.filter { seen.add(it.id) }
    }

    /** `GET /api/social?offset=` is a bare array. The site treats a full page as more. */
    fun offsetHasMore(pageSize: Int): Boolean = pageSize == OFFSET_PAGE

    /** `GET /api/social?reels=1` pages 20 rows. */
    fun reelsHasMore(pageSize: Int): Boolean = pageSize == REELS_PAGE
}

data class StoryCursor(val author: Int, val segment: Int)

sealed class StoryGesture {
    data class Tap(val side: String) : StoryGesture()
    data object Hold : StoryGesture()
    data class Swipe(val direction: String) : StoryGesture()
}

/**
 * Story order and gestures from lib/story-playback.ts.
 * Segments are oldest to newest. The viewer's own group leads.
 */
object StoryPlayback {
    const val HOLD_MS = 200
    const val SWIPE_PX = 48

    fun groupByAuthor(items: List<FeedPost>): List<List<FeedPost>> {
        val order = mutableListOf<String>()
        val buckets = linkedMapOf<String, MutableList<FeedPost>>()
        for (item in items) {
            val bucket = buckets.getOrPut(item.authorId) {
                order += item.authorId
                mutableListOf()
            }
            bucket += item
        }
        return order.map { id ->
            buckets.getValue(id).sortedWith(
                compareBy<FeedPost> { it.createdAt }.thenBy { it.id },
            )
        }
    }

    fun orderGroups(groups: List<List<FeedPost>>, meId: String?): List<List<FeedPost>> {
        if (meId.isNullOrBlank()) return groups
        return groups.filter { it.firstOrNull()?.authorId == meId } +
            groups.filter { it.firstOrNull()?.authorId != meId }
    }

    fun cursorForAuthor(authorIds: List<String>, authorId: String): StoryCursor {
        val author = authorIds.indexOf(authorId)
        return StoryCursor(author = if (author < 0) 0 else author, segment = 0)
    }

    fun stepSegment(lengths: List<Int>, cursor: StoryCursor, direction: Int): StoryCursor? {
        val count = lengths.getOrNull(cursor.author) ?: return null
        if (count < 1) return null
        val segment = cursor.segment + direction
        if (segment in 0 until count) return StoryCursor(cursor.author, segment)
        if (direction > 0) {
            if (cursor.author + 1 < lengths.size) return StoryCursor(cursor.author + 1, 0)
            return null
        }
        if (cursor.author > 0) {
            val previous = cursor.author - 1
            return StoryCursor(previous, lengths[previous] - 1)
        }
        return cursor
    }

    fun stepAuthor(lengths: List<Int>, cursor: StoryCursor, direction: Int): StoryCursor? {
        val author = cursor.author + direction
        if (author < 0) return cursor
        if (author >= lengths.size) return null
        val segment = if (direction > 0) 0 else lengths[author] - 1
        return StoryCursor(author, segment)
    }

    fun classify(durationMs: Long, dx: Float, dy: Float, startXRatio: Float): StoryGesture {
        val absX = kotlin.math.abs(dx)
        val absY = kotlin.math.abs(dy)
        if (absX >= SWIPE_PX && absX > absY) {
            return StoryGesture.Swipe(if (dx < 0f) "next" else "prev")
        }
        if (durationMs >= HOLD_MS) return StoryGesture.Hold
        return StoryGesture.Tap(if (startXRatio < 0.5f) "left" else "right")
    }
}

object FeedTime {
    private val FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.US)

    fun format(epochMillis: Long, zone: ZoneId): String {
        if (epochMillis <= 0L) return ""
        return Instant.ofEpochMilli(epochMillis).atZone(zone).format(FORMAT)
    }
}

/**
 * Process memory for photo bytes already fetched from `/api/media/<key>`.
 * Not written to disk. A byte array larger than the budget is not stored.
 */
class FeedMediaCache(private val maxBytes: Int = DEFAULT_BUDGET) {
    private val lock = Any()
    private val map = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {}
    private var used = 0

    fun get(key: String): ByteArray? = synchronized(lock) { map[key] }

    fun put(key: String, bytes: ByteArray) {
        if (key.isBlank() || bytes.isEmpty() || bytes.size > maxBytes) return
        synchronized(lock) {
            map.remove(key)?.let { used -= it.size }
            map[key] = bytes
            used += bytes.size
            while (used > maxBytes && map.isNotEmpty()) {
                val eldest = map.entries.iterator().next()
                used -= eldest.value.size
                map.remove(eldest.key)
            }
        }
    }

    fun sizeBytes(): Int = synchronized(lock) { used }

    companion object {
        const val DEFAULT_BUDGET = 24 * 1024 * 1024
    }
}
