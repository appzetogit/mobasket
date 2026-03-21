export const isFlutterWebViewBridgeAvailable = () => {
  if (typeof window === "undefined") {
    return false
  }

  return Boolean(window.flutter_inappwebview)
}

export const isFlutterSignInCancelled = (error) => {
  const message = String(error?.message || "").toLowerCase()
  return (
    error?.code === "FLUTTER_SIGN_IN_CANCELLED" ||
    message.includes("cancel") ||
    message.includes("canceled")
  )
}

export const signInWithFlutterNativeGoogle = async (auth) => {
  if (!auth) {
    throw new Error("Firebase Auth instance is required.")
  }

  if (!isFlutterWebViewBridgeAvailable()) {
    return null
  }

  const callHandler = window?.flutter_inappwebview?.callHandler
  if (typeof callHandler !== "function") {
    return null
  }

  let nativeResult = null
  try {
    nativeResult = await callHandler("nativeGoogleSignIn")
  } catch (error) {
    const message = String(error?.message || error || "").toLowerCase()
    const unsupportedHandler =
      message.includes("unsupported handler") ||
      message.includes("nativegooglesignin") ||
      message.includes("not implemented") ||
      message.includes("missingplugin")

    // If bridge exists but native handler is unavailable, let caller use web fallback flow.
    if (unsupportedHandler) {
      return null
    }
    throw error
  }

  if (nativeResult == null) {
    return null
  }

  if (!nativeResult?.success) {
    const resultMessage = String(nativeResult?.message || nativeResult?.error || "").toLowerCase()
    const looksCancelled =
      nativeResult?.cancelled === true ||
      nativeResult?.canceled === true ||
      resultMessage.includes("cancel")

    // If native layer reports a non-success state without explicit cancellation,
    // allow caller to continue with web redirect fallback.
    if (!looksCancelled) {
      return null
    }

    const cancelledError = new Error("Google sign-in was cancelled.")
    cancelledError.code = "FLUTTER_SIGN_IN_CANCELLED"
    throw cancelledError
  }

  const idToken = nativeResult?.idToken
  if (!idToken) {
    throw new Error("Flutter native Google sign-in did not return an ID token.")
  }

  const { GoogleAuthProvider, signInWithCredential } = await import("firebase/auth")
  const credential = GoogleAuthProvider.credential(idToken)
  return signInWithCredential(auth, credential)
}
