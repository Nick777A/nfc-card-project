package com.sciencespo.nfccard.util

import android.content.ContentValues
import android.content.Context
import android.provider.ContactsContract
import com.sciencespo.nfccard.data.ReceivedContact

/** Inserts a received contact into the system Contacts app via ContactsContract. */
object ContactSaver {

    fun save(context: Context, contact: ReceivedContact) {
        val resolver = context.contentResolver

        val rawContactUri = resolver.insert(
            ContactsContract.RawContacts.CONTENT_URI,
            ContentValues().apply {
                put(ContactsContract.RawContacts.ACCOUNT_TYPE, null as String?)
                put(ContactsContract.RawContacts.ACCOUNT_NAME, null as String?)
            }
        ) ?: error("Failed to create raw contact")

        val rawContactId = rawContactUri.lastPathSegment!!.toLong()

        if (contact.fullName.isNotBlank()) {
            resolver.insert(
                ContactsContract.Data.CONTENT_URI,
                ContentValues().apply {
                    put(ContactsContract.Data.RAW_CONTACT_ID, rawContactId)
                    put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                    put(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, contact.fullName)
                }
            )
        }

        if (contact.phone.isNotBlank()) {
            resolver.insert(
                ContactsContract.Data.CONTENT_URI,
                ContentValues().apply {
                    put(ContactsContract.Data.RAW_CONTACT_ID, rawContactId)
                    put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                    put(ContactsContract.CommonDataKinds.Phone.NUMBER, contact.phone)
                    put(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                }
            )
        }

        if (contact.email.isNotBlank()) {
            resolver.insert(
                ContactsContract.Data.CONTENT_URI,
                ContentValues().apply {
                    put(ContactsContract.Data.RAW_CONTACT_ID, rawContactId)
                    put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE)
                    put(ContactsContract.CommonDataKinds.Email.ADDRESS, contact.email)
                    put(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_WORK)
                }
            )
        }

        if (contact.company.isNotBlank() || contact.jobTitle.isNotBlank()) {
            resolver.insert(
                ContactsContract.Data.CONTENT_URI,
                ContentValues().apply {
                    put(ContactsContract.Data.RAW_CONTACT_ID, rawContactId)
                    put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE)
                    put(ContactsContract.CommonDataKinds.Organization.COMPANY, contact.company)
                    put(ContactsContract.CommonDataKinds.Organization.TITLE, contact.jobTitle)
                }
            )
        }

        contact.links.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.forEach { link ->
            resolver.insert(
                ContactsContract.Data.CONTENT_URI,
                ContentValues().apply {
                    put(ContactsContract.Data.RAW_CONTACT_ID, rawContactId)
                    put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Website.CONTENT_ITEM_TYPE)
                    put(ContactsContract.CommonDataKinds.Website.URL, link)
                }
            )
        }
    }
}
