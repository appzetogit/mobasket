package com.mobasket.restaurant

import android.content.Context

object FcmTokenStore {
    private const val PREF_NAME = "mobasket_restaurant_prefs"
    private const val KEY_FCM_TOKEN = "fcm_token"

    fun saveToken(context: Context, token: String) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_FCM_TOKEN, token)
            .apply()
    }

    fun readToken(context: Context): String {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_FCM_TOKEN, "")
            .orEmpty()
    }
}
