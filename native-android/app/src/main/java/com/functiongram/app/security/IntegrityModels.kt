package com.functiongram.app.security

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

enum class IntegrityVerdict {
    /** Package matches and the release certificate matches a configured pin. */
    CONSISTENT,

    /** Useful information, not a pass. Debug builds and unpinched release builds land here. */
    SIGNAL_ONLY,

    /** Package name, debuggable release process, or certificate pin did not match. */
    UNEXPECTED,
}

data class IntegrityObservation(
    val packageName: String,
    val expectedPackageName: String,
    val debuggable: Boolean,
    val debugBuild: Boolean,
    val certificateSha256: List<String>,
    val expectedReleaseCertificates: Set<String>,
    val installer: String?,
)

@Serializable
data class IntegritySnapshot(
    val packageName: String,
    val verdict: String,
    val debuggable: Boolean,
    val installer: String? = null,
    val certificateSha256: List<String>,
    val disclaimer: String,
)

object IntegrityEvaluator {
    const val DISCLAIMER: String =
        "Package name and signing certificate are signals only. They do not prove the process is unmodified."

    fun evaluate(observation: IntegrityObservation): IntegrityVerdict {
        if (observation.packageName != observation.expectedPackageName) {
            return IntegrityVerdict.UNEXPECTED
        }
        if (observation.debugBuild) {
            return IntegrityVerdict.SIGNAL_ONLY
        }
        if (observation.debuggable) {
            return IntegrityVerdict.UNEXPECTED
        }
        if (observation.expectedReleaseCertificates.isEmpty()) {
            return IntegrityVerdict.SIGNAL_ONLY
        }
        val expected = observation.expectedReleaseCertificates.map { it.lowercase() }.toSet()
        val matched = observation.certificateSha256.any { it.lowercase() in expected }
        return if (matched) IntegrityVerdict.CONSISTENT else IntegrityVerdict.UNEXPECTED
    }
}

object ReleaseCertificatePin {
    /**
     * SHA-256 fingerprints of a production signing certificate.
     * Empty until a real production certificate exists. Do not invent one,
     * and do not paste the Android debug certificate or a local proof key here.
     * An empty set keeps the verdict informational.
     */
    val sha256Hex: Set<String> = emptySet()
}

fun IntegrityObservation.toSnapshot(verdict: IntegrityVerdict): IntegritySnapshot {
    return IntegritySnapshot(
        packageName = packageName,
        verdict = verdict.name,
        debuggable = debuggable,
        installer = installer,
        certificateSha256 = certificateSha256,
        disclaimer = IntegrityEvaluator.DISCLAIMER,
    )
}

object IntegritySnapshotCodec {
    private val json = Json { encodeDefaults = true }

    fun encode(snapshot: IntegritySnapshot): String = json.encodeToString(snapshot)
}
