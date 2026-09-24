package com.sciencespo.nfccard.data

import kotlinx.coroutines.flow.Flow

class ContactRepository(
    private val profileDao: ProfileDao,
    private val receivedContactDao: ReceivedContactDao
) {
    val profile: Flow<Profile?> = profileDao.observe()
    val receivedContacts: Flow<List<ReceivedContact>> = receivedContactDao.observeAll()

    suspend fun currentProfile(): Profile? = profileDao.get()

    suspend fun saveProfile(profile: Profile) = profileDao.upsert(profile.copy(id = Profile.SINGLETON_ID))

    suspend fun addReceivedContact(contact: ReceivedContact): Long = receivedContactDao.insert(contact)

    suspend fun markSaved(contact: ReceivedContact) =
        receivedContactDao.update(contact.copy(savedToContacts = true))

    suspend fun deleteReceivedContact(id: Long) = receivedContactDao.delete(id)
}
