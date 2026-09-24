package com.sciencespo.nfccard

import android.app.Application
import com.sciencespo.nfccard.data.AppDatabase
import com.sciencespo.nfccard.data.ContactRepository

class NfcCardApp : Application() {
    lateinit var repository: ContactRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val db = AppDatabase.getInstance(this)
        repository = ContactRepository(db.profileDao(), db.receivedContactDao())
    }
}
