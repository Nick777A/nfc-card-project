package com.sciencespo.nfccard.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sciencespo.nfccard.ui.AppViewModel

@Composable
fun ShareScreen(viewModel: AppViewModel) {
    val sharingEnabled by viewModel.sharingEnabled.collectAsState()
    val tapCount by viewModel.tapCount.collectAsState()
    val remainingSeconds by viewModel.remainingShareSeconds.collectAsState()
    val profile by viewModel.profile.collectAsState()
    val canShare = !profile?.fullName.isNullOrBlank()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.Nfc,
            contentDescription = null,
            modifier = Modifier.size(96.dp),
            tint = if (sharingEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
        )

        Text(
            text = if (sharingEnabled) "Передача включена" else "Передача выключена",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 16.dp)
        )

        if (!canShare) {
            Text(
                text = "Сначала заполните имя в профиле на вкладке «Профиль»",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        Switch(
            checked = sharingEnabled,
            onCheckedChange = { viewModel.setSharingEnabled(it) },
            enabled = canShare,
            modifier = Modifier.padding(top = 24.dp)
        )

        if (sharingEnabled) {
            Text(
                text = "Поднесите к устройству получателя. Другое приложение автоматически считает профиль.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 16.dp)
            )
            remainingSeconds?.let { seconds ->
                Text(
                    text = "Автовыключение через ${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            if (tapCount > 0) {
                Text(
                    text = "Профиль был считан: $tapCount раз(а)",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}
