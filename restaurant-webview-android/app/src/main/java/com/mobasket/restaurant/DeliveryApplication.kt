package com.mobasket.restaurant

import android.app.Application

class DeliveryApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensureCreated(this)
    }
}
