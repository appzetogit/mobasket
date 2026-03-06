import { api } from "@/lib/api"

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"

// Helper function to check if a step is complete
const isStepComplete = (stepData, stepNumber) => {
  if (!stepData) return false

  if (stepNumber === 1) {
    return (
      stepData.restaurantName &&
      stepData.ownerName &&
      stepData.ownerEmail &&
      stepData.ownerPhone &&
      stepData.primaryContactNumber &&
      stepData.location?.area &&
      stepData.location?.city
    )
  }

  if (stepNumber === 2) {
    return (
      Array.isArray(stepData.cuisines) &&
      stepData.cuisines.length > 0 &&
      stepData.deliveryTimings?.openingTime &&
      stepData.deliveryTimings?.closingTime &&
      Array.isArray(stepData.openDays) &&
      stepData.openDays.length > 0 &&
      // Check for menu images (must have at least one)
      Array.isArray(stepData.menuImageUrls) &&
      stepData.menuImageUrls.length > 0 &&
      // Check for profile image
      stepData.profileImageUrl &&
      (stepData.profileImageUrl.url || typeof stepData.profileImageUrl === 'string')
    )
  }

  if (stepNumber === 3) {
    const hasPanImage = stepData.pan?.image && 
      (stepData.pan.image.url || typeof stepData.pan.image === 'string')
    // GST image is required only if GST is registered
    const hasGstImage = !stepData.gst?.isRegistered || 
      (stepData.gst?.image && (stepData.gst.image.url || typeof stepData.gst.image === 'string'))
    
    return (
      stepData.pan?.panNumber &&
      stepData.pan?.nameOnPan &&
      hasPanImage &&
      stepData.fssai?.registrationNumber &&
      hasGstImage &&
      stepData.bank?.accountNumber &&
      stepData.bank?.ifscCode &&
      stepData.bank?.accountHolderName &&
      stepData.bank?.accountType
    )
  }

  return false
}

// Determine which step to show based on completeness
export const determineStepToShow = (data) => {
  if (!data) return 1

  // If completedSteps is 4, onboarding is complete (admin-created restaurants)
  if (data.completedSteps === 4) {
    return null
  }

  // Check step 1
  if (!isStepComplete(data.step1, 1)) {
    return 1
  }

  // Check step 2
  if (!isStepComplete(data.step2, 2)) {
    return 2
  }

  // Check step 3
  if (!isStepComplete(data.step3, 3)) {
    return 3
  }

  // All steps complete
  return null
}

const hasProvisionedRestaurantProfile = (restaurant) => {
  if (!restaurant || typeof restaurant !== "object") return false
  if (restaurant.isActive === true) return true

  const hasBasicInfo = Boolean(
    restaurant.name &&
      restaurant.ownerName &&
      restaurant.ownerEmail &&
      (restaurant.ownerPhone || restaurant.phone || restaurant.primaryContactNumber),
  )
  const hasLocation = Boolean(restaurant.location?.area || restaurant.location?.city)
  const hasCatalogSignals = Boolean(
    (Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0) ||
      (Array.isArray(restaurant.menuImages) && restaurant.menuImages.length > 0) ||
      restaurant.profileImage,
  )

  return hasBasicInfo && hasLocation && hasCatalogSignals
}

// Check onboarding status from API and return the step to navigate to
export const checkOnboardingStatus = async () => {
  try {
    const [onboardingResult, profileResult] = await Promise.allSettled([
      api.get("/restaurant/onboarding"),
      api.get("/restaurant/auth/me"),
    ])

    const onboardingData =
      onboardingResult.status === "fulfilled"
        ? onboardingResult.value?.data?.data?.onboarding
        : null
    const restaurantProfile =
      profileResult.status === "fulfilled"
        ? profileResult.value?.data?.data?.restaurant || profileResult.value?.data?.restaurant
        : null

    if (onboardingData) {
      const stepToShow = determineStepToShow(onboardingData)
      if (stepToShow && hasProvisionedRestaurantProfile(restaurantProfile)) {
        return null
      }
      return stepToShow
    }

    if (hasProvisionedRestaurantProfile(restaurantProfile)) {
      return null
    }

    // No onboarding/profile data, start from step 1
    return 1
  } catch (err) {
    // If API call fails, check localStorage
    try {
      const localData = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (localData) {
        const parsed = JSON.parse(localData)
        return parsed.currentStep || 1
      }
    } catch (localErr) {
      console.error("Failed to check localStorage:", localErr)
    }
    // Default to step 1 if everything fails
    return 1
  }
}

export const getOnboardingStepFromRestaurantPayload = (restaurant) => {
  const onboarding = restaurant?.onboarding
  if (!onboarding) return 1
  return determineStepToShow(onboarding)
}

export const getPostAuthRestaurantPathFromCachedData = () => {
  try {
    const raw = localStorage.getItem("restaurant_user")
    if (!raw) return "/restaurant"
    const restaurant = JSON.parse(raw)
    const step = getOnboardingStepFromRestaurantPayload(restaurant)
    return step ? `/restaurant/onboarding?step=${step}` : "/restaurant"
  } catch {
    return "/restaurant"
  }
}

export const redirectRestaurantAfterAuth = async (navigate, { replace = true } = {}) => {
  try {
    const step = await checkOnboardingStatus()
    const targetPath = step ? `/restaurant/onboarding?step=${step}` : "/restaurant"
    navigate(targetPath, { replace })
  } catch {
    navigate("/restaurant", { replace })
  }
}

