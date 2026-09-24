package com.sciencespo.nfccard.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "received_contact")
data class ReceivedContact(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val fullName: String,
    val phone: String,
    val email: String,
    val company: String,
    val jobTitle: String,
    val links: String,
    val receivedAtEpochMillis: Long,
    val savedToContacts: Boolean = false
)
