package com.mobasket.restaurant

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class DeliveryFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        if (token.isBlank()) return

        FcmTokenStore.saveToken(this, token)
        Handler(Looper.getMainLooper()).post {
            FcmTokenBridge.onTokenChanged?.invoke(token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        NotificationChannels.ensureCreated(this)

        val title = message.notification?.title
            ?: message.data["title"]
            ?: "New restaurant order"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: message.data["message"]
            ?: "Tap to view the new order details."
        val dedupeKey = buildNotificationDedupeKey(message, title, body)

        if (shouldSuppressDuplicate(dedupeKey)) return

        showTopPopupNotification(dedupeKey, title, body)
    }

    private fun showTopPopupNotification(dedupeKey: String, title: String, body: String) {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            dedupeKey.hashCode(),
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, NotificationChannels.ORDER_ALERTS_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(false)
            .setAutoCancel(false)
            .setOngoing(true)
            .setTimeoutAfter(ALERT_TIMEOUT_MS)
            .setSound(NotificationChannels.getAlertSoundUri(this))
            .setVibrate(NotificationChannels.alertVibrationPattern())
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setDefaults(Notification.DEFAULT_LIGHTS)
        }

        val notification = builder.build().apply {
            flags = flags or Notification.FLAG_INSISTENT
        }

        NotificationManagerCompat.from(this)
            .notify(dedupeKey.hashCode() and 0x7fffffff, notification)
    }

    private fun buildNotificationDedupeKey(
        message: RemoteMessage,
        title: String,
        body: String
    ): String {
        val orderId = (message.data["orderId"] ?: message.data["order_id"] ?: "").toString()
        val type = (message.data["type"] ?: "").toString()
        val messageId = message.messageId.orEmpty().trim()

        if (type.isNotEmpty() || orderId.isNotEmpty()) return "$type|$orderId"
        if (messageId.isNotEmpty()) return messageId
        return "$title|$body"
    }

    companion object {
        private const val ALERT_TIMEOUT_MS = 45_000L
        private val recentNotificationKeys = LinkedHashMap<String, Long>()
        private const val DUPLICATE_WINDOW_MS = 20_000L

        @Synchronized
        private fun shouldSuppressDuplicate(key: String): Boolean {
            val now = System.currentTimeMillis()
            val iterator = recentNotificationKeys.entries.iterator()
            while (iterator.hasNext()) {
                val entry = iterator.next()
                if (now - entry.value > DUPLICATE_WINDOW_MS) {
                    iterator.remove()
                }
            }

            val previous = recentNotificationKeys[key]
            if (previous != null && now - previous <= DUPLICATE_WINDOW_MS) {
                return true
            }

            recentNotificationKeys[key] = now
            return false
        }
    }
}
