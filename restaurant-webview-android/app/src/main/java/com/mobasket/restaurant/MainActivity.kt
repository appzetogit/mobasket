package com.mobasket.restaurant

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.firebase.messaging.FirebaseMessaging
import com.mobasket.restaurant.databinding.ActivityMainBinding
import org.json.JSONArray
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var webView: WebView

    private val notificationPermissionRequestCode = 1001
    private val corePermissionsRequestCode = 1002
    private val webPermissionRequestCode = 1003
    private val geolocationPermissionRequestCode = 1004

    private var latestFcmToken: String = ""
    private var hasShownWebContent = false

    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback
            fileChooserCallback = null

            if (callback == null) {
                cameraImageUri = null
                return@registerForActivityResult
            }

            if (result.resultCode != RESULT_OK) {
                callback.onReceiveValue(null)
                cameraImageUri = null
                return@registerForActivityResult
            }

            val data = result.data
            val uris = mutableListOf<Uri>()

            val clipData = data?.clipData
            if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    clipData.getItemAt(i)?.uri?.let { uris.add(it) }
                }
            } else {
                data?.data?.let { uris.add(it) }
            }

            if (uris.isEmpty() && cameraImageUri != null) {
                uris.add(cameraImageUri!!)
            }

            callback.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
            cameraImageUri = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        webView = binding.webView
        setupWebView()
        setupBackHandler()
        requestNotificationPermissionIfNeeded()
        requestCorePermissionsIfNeeded()
        initializeFcmToken()

        webView.loadUrl(getString(R.string.restaurant_web_url))
    }

    override fun onResume() {
        super.onResume()
        FcmTokenBridge.onTokenChanged = { token ->
            latestFcmToken = token
            injectTokenIntoWeb(token)
            syncTokenToBackendIfAuthenticated(token)
        }
    }

    override fun onPause() {
        super.onPause()
        FcmTokenBridge.onTokenChanged = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            userAgentString = "${userAgentString} MoBasketRestaurantAndroidWebView/1.0"
        }

        webView.addJavascriptInterface(AndroidRestaurantBridge(), "AndroidRestaurantApp")
        webView.addJavascriptInterface(AndroidRestaurantBridge(), "AndroidDeliveryApp")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (origin.isNullOrBlank() || callback == null) {
                    callback?.invoke(origin, false, false)
                    return
                }

                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                    return
                }

                pendingGeoOrigin = origin
                pendingGeoCallback = callback
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ),
                    geolocationPermissionRequestCode
                )
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return

                runOnUiThread {
                    val requiredAndroidPerms = mutableListOf<String>()
                    val resources = request.resources?.toList().orEmpty()

                    if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        requiredAndroidPerms.add(Manifest.permission.CAMERA)
                    }
                    if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        requiredAndroidPerms.add(Manifest.permission.RECORD_AUDIO)
                    }

                    if (requiredAndroidPerms.isEmpty()) {
                        request.grant(request.resources)
                        return@runOnUiThread
                    }

                    val missing = requiredAndroidPerms.filterNot { hasPermission(it) }
                    if (missing.isEmpty()) {
                        request.grant(request.resources)
                    } else {
                        pendingWebPermissionRequest = request
                        ActivityCompat.requestPermissions(
                            this@MainActivity,
                            missing.toTypedArray(),
                            webPermissionRequestCode
                        )
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                if (pendingWebPermissionRequest == request) {
                    pendingWebPermissionRequest = null
                }
                super.onPermissionRequestCanceled(request)
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                if (filePathCallback == null) {
                    return false
                }

                val contentIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
                }

                val initialIntents = mutableListOf<Intent>()
                if (hasPermission(Manifest.permission.CAMERA)) {
                    val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    val photoUri = createCameraImageUri()
                    if (photoUri != null && cameraIntent.resolveActivity(packageManager) != null) {
                        cameraImageUri = photoUri
                        cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                        cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                        initialIntents.add(cameraIntent)
                    }
                }

                val chooser = Intent(Intent.ACTION_CHOOSER).apply {
                    putExtra(Intent.EXTRA_INTENT, contentIntent)
                    putExtra(Intent.EXTRA_TITLE, "Upload file")
                    if (initialIntents.isNotEmpty()) {
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, initialIntents.toTypedArray())
                    }
                }

                return try {
                    fileChooserLauncher.launch(chooser)
                    true
                } catch (_: Exception) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    cameraImageUri = null
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                if (isAllowedHost(url)) return false
                runCatching {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (!hasShownWebContent) {
                    hasShownWebContent = true
                    webView.visibility = android.view.View.VISIBLE
                    binding.loadingOverlay.animate()
                        .alpha(0f)
                        .setDuration(220)
                        .withEndAction {
                            binding.loadingOverlay.visibility = android.view.View.GONE
                        }
                        .start()
                }
                if (latestFcmToken.isNotBlank()) {
                    injectTokenIntoWeb(latestFcmToken)
                    syncTokenToBackendIfAuthenticated(latestFcmToken)
                }
            }
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasLocationPermission(): Boolean {
        return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
            hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    private fun requestCorePermissionsIfNeeded() {
        val required = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            add(Manifest.permission.CAMERA)
            addAll(getGalleryPermissions())
        }

        val missing = required.filterNot { hasPermission(it) }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), corePermissionsRequestCode)
        }
    }

    private fun getGalleryPermissions(): List<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            listOf(
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO
            )
        } else {
            listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        when (requestCode) {
            webPermissionRequestCode -> {
                val grantedAll =
                    grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
                val request = pendingWebPermissionRequest
                pendingWebPermissionRequest = null

                if (grantedAll) {
                    request?.grant(request.resources)
                } else {
                    request?.deny()
                }
            }

            geolocationPermissionRequestCode -> {
                val granted =
                    grantResults.isNotEmpty() && grantResults.any { it == PackageManager.PERMISSION_GRANTED }
                val origin = pendingGeoOrigin
                val callback = pendingGeoCallback
                pendingGeoOrigin = null
                pendingGeoCallback = null
                callback?.invoke(origin, granted, false)
            }
        }
    }

    private fun isAllowedHost(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return true
        return host == "mobasket.in" || host.endsWith(".mobasket.in")
    }

    private fun createCameraImageUri(): Uri? {
        return try {
            val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val imageDir = File(cacheDir, "restaurant_camera").apply { mkdirs() }
            val imageFile = File.createTempFile("IMG_${timestamp}_", ".jpg", imageDir)
            FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                imageFile
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun initializeFcmToken() {
        val cached = FcmTokenStore.readToken(this)
        if (cached.isNotBlank()) {
            latestFcmToken = cached
        }

        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                if (token.isNullOrBlank()) return@addOnSuccessListener
                latestFcmToken = token
                FcmTokenStore.saveToken(this, token)
                injectTokenIntoWeb(token)
                syncTokenToBackendIfAuthenticated(token)
            }
    }

    private fun injectTokenIntoWeb(token: String) {
        if (token.isBlank()) return

        val escapedToken = token
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("'", "\\'")

        val js = """
            (function() {
              try {
                var token = '$escapedToken';
                localStorage.setItem('restaurant_fcmTokenMobile', token);
                localStorage.setItem('restaurant_fcm_mobile_token', token);
                localStorage.setItem('fcmTokenMobile', token);
                localStorage.setItem('fcm_mobile_token', token);
                localStorage.setItem('delivery_fcmTokenMobile', token);
                localStorage.setItem('delivery_fcm_mobile_token', token);
                window.__FCM_TOKEN_MOBILE = token;
                window.__FCM_TOKEN = token;
                window.fcmTokenMobile = token;
                window.fcmToken = token;

                if (!window.flutter_inappwebview) {
                  window.flutter_inappwebview = {};
                }

                window.flutter_inappwebview.callHandler = function(name) {
                  var supported = [
                    'getFcmToken', 'getFCMToken', 'getMobileFcmToken', 'getNativeFcmToken',
                    'getFirebaseToken', 'getNotificationToken', 'getPushToken', 'getDeviceToken', 'getToken'
                  ];
                  if (supported.indexOf(name) !== -1) {
                    return Promise.resolve(token);
                  }
                  return Promise.reject('Unsupported handler: ' + name);
                };
              } catch (e) {}
            })();
        """.trimIndent()

        webView.evaluateJavascript(js, null)
    }

    private fun syncTokenToBackendIfAuthenticated(token: String) {
        if (token.isBlank()) return

        evaluateAccessToken { accessToken ->
            if (accessToken.isBlank()) return@evaluateAccessToken
            FcmTokenSyncer.sync(
                context = this,
                fcmToken = token,
                accessToken = accessToken,
                endpoint = getString(R.string.restaurant_fcm_api_url)
            )
        }
    }

    private fun evaluateAccessToken(callback: (String) -> Unit) {
        val js = """
            (function() {
              try {
                return localStorage.getItem('restaurant_accessToken')
                  || localStorage.getItem('accessToken')
                  || localStorage.getItem('delivery_accessToken')
                  || '';
              } catch (e) {
                return '';
              }
            })();
        """.trimIndent()

        webView.evaluateJavascript(js) { raw ->
            callback(parseJsString(raw))
        }
    }

    private fun parseJsString(raw: String?): String {
        if (raw == null || raw == "null" || raw.isBlank()) return ""
        return try {
            JSONArray("[$raw]").getString(0)
        } catch (_: Exception) {
            raw.trim('"')
        }
    }

    private fun setupBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val alreadyGranted = hasPermission(Manifest.permission.POST_NOTIFICATIONS)

        if (!alreadyGranted) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                notificationPermissionRequestCode
            )
        }
    }

    inner class AndroidRestaurantBridge {
        @JavascriptInterface
        fun getFcmToken(): String = latestFcmToken

        @JavascriptInterface
        fun refreshFcmToken() {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (token.isNullOrBlank()) return@addOnSuccessListener
                    latestFcmToken = token
                    FcmTokenStore.saveToken(this@MainActivity, token)
                    injectTokenIntoWeb(token)
                    syncTokenToBackendIfAuthenticated(token)
                }
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        cameraImageUri = null
        super.onDestroy()
    }
}
