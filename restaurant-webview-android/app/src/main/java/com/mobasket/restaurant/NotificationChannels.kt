package com.mobasket.restaurant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

object NotificationChannels {
    const val ORDER_ALERTS_CHANNEL_ID = "restaurant_order_alerts_v3"
    private val ALERT_VIBRATION_PATTERN = longArrayOf(0, 1200, 400, 1200, 400, 1200, 400, 1200)

    fun getAlertSoundUri(context: Context): Uri {
        return Uri.parse("android.resource://${context.packageName}/${R.raw.original}")
    }

    fun ensureCreated(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        manager.deleteNotificationChannel("delivery_order_alerts_alert")
        manager.deleteNotificationChannel("restaurant_order_alerts_v2")

        val existingChannel = manager.getNotificationChannel(ORDER_ALERTS_CHANNEL_ID)
        if (existingChannel != null) return

        val channel = NotificationChannel(
            ORDER_ALERTS_CHANNEL_ID,
            "Restaurant Order Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Buzzing alerts for new restaurant orders"
            enableLights(true)
            enableVibration(true)
            vibrationPattern = ALERT_VIBRATION_PATTERN
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setShowBadge(true)
            setBypassDnd(true)
            setSound(
                getAlertSoundUri(context),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }

        manager.createNotificationChannel(channel)
    }

    fun alertVibrationPattern(): LongArray = ALERT_VIBRATION_PATTERN.copyOf()
}
