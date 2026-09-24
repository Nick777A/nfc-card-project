package com.sciencespo.nfccard.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import com.sciencespo.nfccard.nfc.ParsedVCard

@Composable
fun ReceivedContactDialog(
    contact: ParsedVCard,
    onAccept: () -> Unit,
    onReject: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onReject,
        title = { Text("Получен контакт") },
        text = {
            Column {
                Text(contact.fullName.ifBlank { "(без имени)" })
                if (contact.jobTitle.isNotBlank() || contact.company.isNotBlank()) {
                    Text(
                        listOfNotNull(
                            contact.jobTitle.takeIf { it.isNotBlank() },
                            contact.company.takeIf { it.isNotBlank() }
                        ).joinToString(", ")
                    )
                }
                if (contact.phone.isNotBlank()) Text(contact.phone)
                if (contact.email.isNotBlank()) Text(contact.email)
            }
        },
        confirmButton = {
            TextButton(onClick = onAccept) {
                Text("Сохранить в контакты")
            }
        },
        dismissButton = {
            TextButton(onClick = onReject) {
                Text("Отклонить")
            }
        }
    )
}
