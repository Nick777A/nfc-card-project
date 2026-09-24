package com.sciencespo.nfccard.data

import androidx.room.Dao
import androidx.room.OnConflictStrategy
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ProfileDao {
    @Query("SELECT * FROM profile WHERE id = ${Profile.SINGLETON_ID} LIMIT 1")
    fun observe(): Flow<Profile?>

    @Query("SELECT * FROM profile WHERE id = ${Profile.SINGLETON_ID} LIMIT 1")
    suspend fun get(): Profile?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: Profile)
}
