package com.mobasket.restaurant

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object FcmTokenSyncer {

    private val client = OkHttpClient.Builder().build()
    private const val PREF_NAME = "mobasket_restaurant_prefs"
    private const val KEY_LAST_SYNCED_TOKEN = "last_synced_token"

    fun sync(context: Context, fcmToken: String, accessToken: String, endpoint: String) {
        if (fcmToken.isBlank() || accessToken.isBlank() || endpoint.isBlank()) return

        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val lastSyncedToken = prefs.getString(KEY_LAST_SYNCED_TOKEN, "").orEmpty()
        if (lastSyncedToken == fcmToken) return

        val bodyJson = JSONObject()
            .put("token", fcmToken)
            .put("platform", "android")
            .put("channel", "mobile")

        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Accept", "application/json")
            .post(bodyJson.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()

        client.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                // No-op. The next page load or token refresh retries automatically.
            }

            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                response.use {
                    if (it.isSuccessful) {
                        prefs.edit().putString(KEY_LAST_SYNCED_TOKEN, fcmToken).apply()
                    }
                }
            }
        })
    }
}
