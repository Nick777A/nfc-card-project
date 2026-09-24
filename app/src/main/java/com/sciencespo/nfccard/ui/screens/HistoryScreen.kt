package com.sciencespo.nfccard.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sciencespo.nfccard.data.ReceivedContact
import com.sciencespo.nfccard.ui.AppViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun HistoryScreen(viewModel: AppViewModel) {
    val contacts by viewModel.receivedContacts.collectAsState()
    val requestContactsPermission = com.sciencespo.nfccard.ui.rememberWriteContactsGate()

    if (contacts.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Пока нет полученных контактов", style = MaterialTheme.typography.bodyLarge)
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(contacts, key = { it.id }) { contact ->
            HistoryItem(
                contact = contact,
                onSaveToContacts = {
                    requestContactsPermission { viewModel.saveExistingToContacts(contact) }
                },
                onDelete = { viewModel.deleteReceivedContact(contact.id) }
            )
        }
    }
}

@Composable
private fun HistoryItem(
    contact: ReceivedContact,
    onSaveToContacts: () -> Unit,
    onDelete: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(contact.fullName.ifBlank { "(без имени)" }, style = MaterialTheme.typography.titleMedium)
            if (contact.jobTitle.isNotBlank() || contact.company.isNotBlank()) {
                Text(
                    listOfNotNull(
                        contact.jobTitle.takeIf { it.isNotBlank() },
                        contact.company.takeIf { it.isNotBlank() }
                    ).joinToString(", "),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            if (contact.phone.isNotBlank()) Text(contact.phone, style = MaterialTheme.typography.bodySmall)
            if (contact.email.isNotBlank()) Text(contact.email, style = MaterialTheme.typography.bodySmall)
            Text(
                formatDate(contact.receivedAtEpochMillis),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp)
            )

            androidx.compose.foundation.layout.Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                if (contact.savedToContacts) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = "Сохранено в контакты")
                } else {
                    IconButton(onClick = onSaveToContacts) {
                        Icon(Icons.Filled.PersonAdd, contentDescription = "Сохранить в контакты")
                    }
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = "Удалить")
                }
            }
        }
    }
}

private fun formatDate(epochMillis: Long): String =
    SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(epochMillis))
