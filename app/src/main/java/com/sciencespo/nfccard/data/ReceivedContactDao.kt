package com.sciencespo.nfccard.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface ReceivedContactDao {
    @Query("SELECT * FROM received_contact ORDER BY receivedAtEpochMillis DESC")
    fun observeAll(): Flow<List<ReceivedContact>>

    @Insert
    suspend fun insert(contact: ReceivedContact): Long

    @Update
    suspend fun update(contact: ReceivedContact)

    @Query("DELETE FROM received_contact WHERE id = :id")
    suspend fun delete(id: Long)
}
