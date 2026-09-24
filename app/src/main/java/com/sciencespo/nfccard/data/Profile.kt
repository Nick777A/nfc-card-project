package com.sciencespo.nfccard.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * The single local user profile that is broadcast over HCE when sharing is
 * enabled. A fixed id of 1 is used since the prototype supports only one
 * active profile per device (no accounts, no multi-profile switching).
 */
@Entity(tableName = "profile")
data class Profile(
    @PrimaryKey val id: Int = SINGLETON_ID,
    val fullName: String = "",
    val phone: String = "",
    val email: String = "",
    val company: String = "",
    val jobTitle: String = "",
    val links: String = "" // newline-separated list of URLs
) {
    companion object {
        const val SINGLETON_ID = 1
    }
}
