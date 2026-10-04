package com.functiongram.app.security

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import com.functiongram.app.BuildConfig

/**
 * Reads this app's own package name, debuggable flag, installer, and signing
 * certificates. It does not try to detect root, hook frameworks, or a modified
 * process image. Those checks are not reliable and are not claimed here.
 */
class PackageIdentitySignal(
    private val context: Context,
) {
    fun observe(): IntegrityObservation {
        return IntegrityObservation(
            packageName = context.packageName,
            expectedPackageName = EXPECTED_PACKAGE,
            debuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0,
            debugBuild = BuildConfig.DEBUG,
            certificateSha256 = certificateSha256(),
            expectedReleaseCertificates = ReleaseCertificatePin.sha256Hex,
            installer = installerPackage(),
        )
    }

    private fun certificateSha256(): List<String> {
        val info = context.packageManager.getPackageInfo(
            context.packageName,
            PackageManager.GET_SIGNING_CERTIFICATES,
        )
        val signing = info.signingInfo ?: return emptyList()
        val signatures = if (signing.hasMultipleSigners()) {
            signing.apkContentsSigners
        } else {
            signing.signingCertificateHistory
        }
        return signatures.map { Digests.sha256Hex(it.toByteArray()) }
    }

    private fun installerPackage(): String? {
        return if (Build.VERSION.SDK_INT >= 30) {
            context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
    }

    private companion object {
        const val EXPECTED_PACKAGE = "com.functiongram.app"
    }
}
