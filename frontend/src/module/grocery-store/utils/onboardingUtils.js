import { groceryStoreAPI } from "@/lib/api"

const GROCERY_ONBOARDING_STORAGE_KEY = "grocery-store_onboarding"

export const determineGroceryStoreStepToShow = (onboarding) => {
  if (!onboarding || typeof onboarding !== "object") {
    return 1
  }

  return Number(onboarding.completedSteps || 0) >= 1 ? null : 1
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

    if (onboardingData) {
      return determineGroceryStoreStepToShow(onboardingData)
    }

    if (storeProfile?.onboarding) {
      return determineGroceryStoreStepToShow(storeProfile.onboarding)
    }

    return 1
  } catch {
    try {
      const localData = localStorage.getItem(GROCERY_ONBOARDING_STORAGE_KEY)
      if (localData) {
        const parsed = JSON.parse(localData)
        return determineGroceryStoreStepToShow(parsed)
      }
    } catch {
      // Ignore malformed local onboarding cache.
    }

    return 1
  }
}

export const getGroceryStoreOnboardingStepFromPayload = (store) => {
  return determineGroceryStoreStepToShow(store?.onboarding)
}

export const getPostAuthGroceryStorePathFromCachedData = () => {
  try {
    const raw = localStorage.getItem("grocery-store_user")
    if (!raw) return "/store/onboarding"
    const store = JSON.parse(raw)
    const step = getGroceryStoreOnboardingStepFromPayload(store)
    return step ? `/store/onboarding?step=${step}` : "/store"
  } catch {
    return "/store/onboarding"
  }
}

export const redirectGroceryStoreAfterAuth = async (navigate, { replace = true } = {}) => {
  try {
    const step = await checkGroceryStoreOnboardingStatus()
    navigate(step ? `/store/onboarding?step=${step}` : "/store", { replace })
  } catch {
    navigate("/store/onboarding", { replace })
  }
}
