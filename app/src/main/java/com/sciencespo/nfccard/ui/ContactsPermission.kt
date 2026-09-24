package com.sciencespo.nfccard.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/**
 * Returns a function that runs [action] immediately if WRITE_CONTACTS is
 * already granted, or requests it first and runs [action] only once the user
 * grants it (a denial simply does nothing, matching the "Отклонить"-style
 * expectation that nothing gets written without permission).
 */
@Composable
fun rememberWriteContactsGate(): (() -> Unit) -> Unit {
    val context = LocalContext.current
    var pendingAction by remember { mutableStateOf<(() -> Unit)?>(null) }
    val latestPending = rememberUpdatedState(pendingAction)

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) latestPending.value?.invoke()
        pendingAction = null
    }

    return { action ->
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.WRITE_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            action()
        } else {
            pendingAction = action
            launcher.launch(Manifest.permission.WRITE_CONTACTS)
        }
    }
}
