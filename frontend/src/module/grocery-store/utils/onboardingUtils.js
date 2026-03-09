import { groceryStoreAPI } from "@/lib/api"

export const determineGroceryStoreStepToShow = (onboarding) => {
  if (!onboarding || typeof onboarding !== "object") {
    return 1
  }

  return Number(onboarding.completedSteps || 0) >= 1 ? null : 1
}

const hasProvisionedGroceryStoreProfile = (store) => {
  if (!store || typeof store !== "object") return false
  if (store.isActive === true) return true

  if (store.approvedAt || store.rejectedAt || store.rejectionReason) {
    return true
  }

  if (Number(store?.onboarding?.completedSteps || 0) >= 1) {
    return true
  }

  const hasBasicInfo = Boolean(
    store.name &&
    store.ownerName &&
    (store.ownerEmail || store.email) &&
    (store.ownerPhone || store.phone || store.primaryContactNumber),
  )
  const hasLocation = Boolean(
    store.location?.formattedAddress ||
    store.location?.address ||
    store.location?.area ||
    store.location?.city
  )

  return hasBasicInfo && hasLocation
}

export const checkGroceryStoreOnboardingStatus = async () => {
  try {
    const [onboardingResult, profileResult] = await Promise.allSettled([
      groceryStoreAPI.getOnboarding(),
      groceryStoreAPI.getCurrentStore(),
    ])

    const onboardingData =
      onboardingResult.status === "fulfilled"
        ? onboardingResult.value?.data?.data?.onboarding
        : null
    const storeProfile =
      profileResult.status === "fulfilled"
        ? profileResult.value?.data?.data?.store || profileResult.value?.data?.store
        : null

    if (hasProvisionedGroceryStoreProfile(storeProfile)) {
      return null
    }

    if (onboardingData) {
      return determineGroceryStoreStepToShow(onboardingData)
    }

    if (storeProfile?.onboarding) {
      return determineGroceryStoreStepToShow(storeProfile.onboarding)
    }

    return 1
  } catch {
    return 1
  }
}

export const getGroceryStoreOnboardingStepFromPayload = (store) => {
  return determineGroceryStoreStepToShow(store?.onboarding)
}

export const getPostAuthGroceryStorePathFromCachedData = () => {
  return "/store"
}

export const redirectGroceryStoreAfterAuth = async (navigate, { replace = true, redirectTo = null } = {}) => {
  try {
    const step = await checkGroceryStoreOnboardingStatus()
    if (step) {
      navigate(`/store/onboarding?step=${step}`, { replace })
    } else {
      // Use redirectTo if provided, otherwise fallback to /store
      navigate(redirectTo || "/store", { replace })
    }
  } catch {
    navigate("/store/onboarding", { replace })
  }
}
