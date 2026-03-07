import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, ArrowLeft } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { uploadAPI, api, restaurantAPI } from "@/lib/api"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { determineStepToShow } from "../utils/onboardingUtils"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { clearRestaurantSignupSession } from "@/lib/utils/auth"

const cuisinesOptions = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Pizza",
  "Burgers",
  "Bakery",
  "Cafe",
]

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DEFAULT_OPENING_TIME = "09:00"
const DEFAULT_CLOSING_TIME = "22:00"

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, step4, currentStep) => {
  try {
    // Convert File objects to a serializable format (we'll store file names/paths if available)
    const serializableStep2 = {
      ...step2,
      menuImages: step2.menuImages.map((file) => {
        if (file instanceof File) {
          return { name: file.name, size: file.size, type: file.type }
        }
        return file
      }),
      profileImage: step2.profileImage instanceof File
        ? { name: step2.profileImage.name, size: step2.profileImage.size, type: step2.profileImage.type }
        : step2.profileImage,
    }

    const serializableStep3 = {
      ...step3,
      panImage: step3.panImage instanceof File
        ? { name: step3.panImage.name, size: step3.panImage.size, type: step3.panImage.type }
        : step3.panImage,
      gstImage: step3.gstImage instanceof File
        ? { name: step3.gstImage.name, size: step3.gstImage.size, type: step3.gstImage.type }
        : step3.gstImage,
      fssaiImage: step3.fssaiImage instanceof File
        ? { name: step3.fssaiImage.name, size: step3.fssaiImage.size, type: step3.fssaiImage.type }
        : step3.fssaiImage,
    }

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      step4: step4 || {},
      currentStep,
      timestamp: Date.now(),
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(dataToSave))
  } catch (error) {
    console.error("Failed to save onboarding data to localStorage:", error)
  }
}

const loadOnboardingFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error("Failed to load onboarding data from localStorage:", error)
  }
  return null
}

const clearOnboardingFromLocalStorage = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear onboarding data from localStorage:", error)
  }
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(":")) {
    return new Date(2000, 0, 1, 10, 0) // Default to 10:00 AM
  }
  const [hours, minutes] = timeString.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 10, minutes || 0)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

function TimeSelector({ label, value, onChange }) {
  const timeValue = stringToTime(value)

  const handleTimeChange = (newValue) => {
    if (newValue) {
      const timeString = timeToString(newValue)
      onChange(timeString)
    }
  }

  return (
    <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-800" />
        <span className="text-xs font-medium text-gray-900">{label}</span>
      </div>
      <MobileTimePicker
        value={timeValue}
        onChange={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            placeholder: "Select time",
            sx: {
              "& .MuiOutlinedInput-root": {
                height: "36px",
                fontSize: "12px",
                backgroundColor: "white",
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#d1d5db",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#000",
                },
              },
              "& .MuiInputBase-input": {
                padding: "8px 12px",
                fontSize: "12px",
              },
            },
          },
        }}
        format="hh:mm a"
      />
    </div>
  )
}

export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedStepParam = searchParams.get("step")
  const isFreshStepOne = requestedStepParam === "1"
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [signedInPhone, setSignedInPhone] = useState("")
  const [showBackPopup, setShowBackPopup] = useState(false)

  const [step1, setStep1] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    location: {
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      landmark: "",
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: DEFAULT_OPENING_TIME,
    closingTime: DEFAULT_CLOSING_TIME,
    openDays: [],
  })

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "",
    featuredDish: "",
    featuredPrice: "",
    offer: "",
  })

  const normalizePhoneDigits = (value) => String(value || "").replace(/\D/g, "")

  // Load from localStorage on mount and check URL parameter
  useEffect(() => {
    // Check if step is specified in URL (from OTP login redirect)
    const stepParam = requestedStepParam
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10)
      if (stepNum >= 1 && stepNum <= 4) {
        setStep(stepNum)
      }
    }

    if (isFreshStepOne) {
      clearOnboardingFromLocalStorage()
      return
    }

    const localData = loadOnboardingFromLocalStorage()
    if (localData) {
      if (localData.step1) {
        setStep1({
          restaurantName: localData.step1.restaurantName || "",
          ownerName: localData.step1.ownerName || "",
          ownerEmail: localData.step1.ownerEmail || "",
          ownerPhone: localData.step1.ownerPhone || "",
          primaryContactNumber: localData.step1.primaryContactNumber || "",
          location: {
            addressLine1: localData.step1.location?.addressLine1 || "",
            addressLine2: localData.step1.location?.addressLine2 || "",
            area: localData.step1.location?.area || "",
            city: localData.step1.location?.city || "",
            landmark: localData.step1.location?.landmark || "",
          },
        })
      }
      if (localData.step2) {
        setStep2({
          menuImages: localData.step2.menuImages || [],
          profileImage: localData.step2.profileImage || null,
          cuisines: localData.step2.cuisines || [],
          openingTime: localData.step2.openingTime || DEFAULT_OPENING_TIME,
          closingTime: localData.step2.closingTime || DEFAULT_CLOSING_TIME,
          openDays: localData.step2.openDays || [],
        })
      }
      if (localData.step3) {
        setStep3({
          panNumber: localData.step3.panNumber || "",
          nameOnPan: localData.step3.nameOnPan || "",
          panImage: localData.step3.panImage || null,
          gstRegistered: localData.step3.gstRegistered || false,
          gstNumber: localData.step3.gstNumber || "",
          gstLegalName: localData.step3.gstLegalName || "",
          gstAddress: localData.step3.gstAddress || "",
          gstImage: localData.step3.gstImage || null,
          fssaiNumber: localData.step3.fssaiNumber || "",
          fssaiExpiry: localData.step3.fssaiExpiry || "",
          fssaiImage: localData.step3.fssaiImage || null,
          accountNumber: localData.step3.accountNumber || "",
          confirmAccountNumber: localData.step3.confirmAccountNumber || "",
          ifscCode: localData.step3.ifscCode || "",
          accountHolderName: localData.step3.accountHolderName || "",
          accountType: localData.step3.accountType || "",
        })
      }
      if (localData.step4) {
        setStep4({
          estimatedDeliveryTime: localData.step4.estimatedDeliveryTime || "",
          featuredDish: localData.step4.featuredDish || "",
          featuredPrice: localData.step4.featuredPrice || "",
          offer: localData.step4.offer || "",
        })
      }
      // Only set step from localStorage if URL doesn't have a step parameter
      if (localData.currentStep && !stepParam) {
        setStep(localData.currentStep)
      }
    }
  }, [isFreshStepOne, requestedStepParam, searchParams])

  // Save to localStorage whenever step data changes
  useEffect(() => {
    saveOnboardingToLocalStorage(step1, step2, step3, step4, step)
  }, [step1, step2, step3, step4, step])

  useEffect(() => {
    const fetchData = async () => {
      if (isFreshStepOne) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const res = await api.get("/restaurant/onboarding")
        const data = res?.data?.data?.onboarding
        if (data) {
          if (data.step1) {
            setStep1(() => ({
              restaurantName: data.step1.restaurantName || "",
              ownerName: data.step1.ownerName || "",
              ownerEmail: data.step1.ownerEmail || "",
              ownerPhone: data.step1.ownerPhone || "",
              primaryContactNumber: data.step1.primaryContactNumber || "",
              location: {
                addressLine1: data.step1.location?.addressLine1 || "",
                addressLine2: data.step1.location?.addressLine2 || "",
                area: data.step1.location?.area || "",
                city: data.step1.location?.city || "",
                landmark: data.step1.location?.landmark || "",
              },
            }))
          }
          if (data.step2) {
            setStep2({
              // Load menu images from URLs if available
              menuImages: data.step2.menuImageUrls || [],
              // Load profile image URL if available
              profileImage: data.step2.profileImageUrl || null,
              cuisines: data.step2.cuisines || [],
              openingTime: data.step2.deliveryTimings?.openingTime || DEFAULT_OPENING_TIME,
              closingTime: data.step2.deliveryTimings?.closingTime || DEFAULT_CLOSING_TIME,
              openDays: data.step2.openDays || [],
            })
          }
          if (data.step3) {
            setStep3({
              panNumber: data.step3.pan?.panNumber || "",
              nameOnPan: data.step3.pan?.nameOnPan || "",
              panImage: null, // Don't load images from API, user needs to re-upload
              gstRegistered: data.step3.gst?.isRegistered || false,
              gstNumber: data.step3.gst?.gstNumber || "",
              gstLegalName: data.step3.gst?.legalName || "",
              gstAddress: data.step3.gst?.address || "",
              gstImage: null, // Don't load images from API, user needs to re-upload
              fssaiNumber: data.step3.fssai?.registrationNumber || "",
              fssaiExpiry: data.step3.fssai?.expiryDate
                ? data.step3.fssai.expiryDate.slice(0, 10)
                : "",
              fssaiImage: null, // Don't load images from API, user needs to re-upload
              accountNumber: data.step3.bank?.accountNumber || "",
              confirmAccountNumber: data.step3.bank?.accountNumber || "",
              ifscCode: data.step3.bank?.ifscCode || "",
              accountHolderName: data.step3.bank?.accountHolderName || "",
              accountType: data.step3.bank?.accountType || "",
            })
          }

          if (data.step4) {
            setStep4({
              estimatedDeliveryTime: data.step4.estimatedDeliveryTime || "",
              featuredDish: data.step4.featuredDish || "",
              featuredPrice: data.step4.featuredPrice || "",
              offer: data.step4.offer || "",
            })
          }

          // Determine which step to show based on completeness
          const stepToShow = determineStepToShow(data)
          setStep(stepToShow)
        }
      } catch (err) {
        // Handle error gracefully - if it's a 401 (unauthorized), the user might need to login again
        // Otherwise, just continue with empty onboarding data
        if (err?.response?.status === 401) {
          console.error("Authentication error fetching onboarding:", err)
          // Don't show error to user, they can still fill the form
          // The error might be because restaurant is not yet active (pending verification)
        } else {
          console.error("Error fetching onboarding data:", err)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isFreshStepOne])

  useEffect(() => {
    if (isFreshStepOne) {
      setSignedInPhone("")
      return
    }

    const resolveSignedInPhone = async () => {
      try {
        const cachedRaw = localStorage.getItem("restaurant_user")
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw)
          const cachedPhone = normalizePhoneDigits(
            cached?.ownerPhone || cached?.primaryContactNumber || cached?.phone
          )
          if (cachedPhone) {
            setSignedInPhone(cachedPhone)
            return
          }
        }
      } catch (error) {
        console.error("Failed to parse cached restaurant user:", error)
      }

      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant = response?.data?.data?.restaurant || response?.data?.data || {}
        const profilePhone = normalizePhoneDigits(
          restaurant?.ownerPhone || restaurant?.primaryContactNumber || restaurant?.phone
        )
        if (profilePhone) {
          setSignedInPhone(profilePhone)
        }
      } catch (error) {
        console.error("Failed to fetch signed-in restaurant phone:", error)
      }
    }

    resolveSignedInPhone()
  }, [isFreshStepOne])

  useEffect(() => {
    if (isFreshStepOne || !signedInPhone) return
    setStep1((prev) => {
      const next = { ...prev }
      let changed = false
      if (!normalizePhoneDigits(prev.ownerPhone)) {
        next.ownerPhone = signedInPhone
        changed = true
      }
      if (!normalizePhoneDigits(prev.primaryContactNumber)) {
        next.primaryContactNumber = signedInPhone
        changed = true
      }
      return changed ? next : prev
    })
  }, [isFreshStepOne, signedInPhone])

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      console.error("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = []

    if (!step1.restaurantName?.trim()) {
      errors.push("Restaurant name is required")
    }
    if (!step1.ownerName?.trim()) {
      errors.push("Owner name is required")
    } else if (!/^[A-Za-z\s-]+$/.test(step1.ownerName.trim())) {
      errors.push("Full name should contain only letters and spaces")
    }
    if (!step1.ownerEmail?.trim()) {
      errors.push("Owner email is required")
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.ownerEmail)) {
      errors.push("Please enter a valid email address")
    }
    if (!step1.ownerPhone?.trim()) {
      errors.push("Owner phone number is required")
    } else if (!/^\d{7,15}$/.test(step1.ownerPhone.trim())) {
      errors.push("Phone number must be 7-15 digits only")
    }
    if (!step1.primaryContactNumber?.trim()) {
      errors.push("Primary contact number is required")
    } else if (!/^\d{7,15}$/.test(step1.primaryContactNumber.trim())) {
      errors.push("Primary contact number must be 7-15 digits only")
    }
    if (!step1.location?.area?.trim()) {
      errors.push("Area/Sector/Locality is required")
    }
    if (!step1.location?.city?.trim()) {
      errors.push("City is required")
    }

    return errors
  }

  const validateStep2 = () => {
    return []
  }

  const validateStep4 = () => {
    return []
  }

  const validateStep3 = () => {
    return []
  }

  // Fill dummy data for testing (development mode only)
  const fillDummyData = () => {
    if (step === 1) {
      setStep1({
        restaurantName: "Test Restaurant",
        ownerName: "John Doe",
        ownerEmail: "john.doe@example.com",
        ownerPhone: "+91 9876543210",
        primaryContactNumber: "+91 9876543210",
        location: {
          addressLine1: "123 Main Street",
          addressLine2: "Building A, Floor 2",
          area: "Downtown",
          city: "Mumbai",
          landmark: "Near Central Park",
        },
      })
      toast.success("Step 1 filled with dummy data", { duration: 2000 })
    } else if (step === 2) {
      setStep2({
        menuImages: [],
        profileImage: null,
        cuisines: ["North Indian", "Chinese"],
        openingTime: "09:00",
        closingTime: "22:00",
        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      })
      toast.success("Step 2 filled with dummy data", { duration: 2000 })
    } else if (step === 3) {
      // Calculate expiry date 1 year from now
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      const expiryDateString = expiryDate.toISOString().split("T")[0]

      setStep3({
        panNumber: "ABCDE1234F",
        nameOnPan: "John Doe",
        panImage: null,
        gstRegistered: true,
        gstNumber: "27ABCDE1234F1Z5",
        gstLegalName: "Test Restaurant Private Limited",
        gstAddress: "123 Main Street, Mumbai, Maharashtra 400001",
        gstImage: null,
        fssaiNumber: "12345678901234",
        fssaiExpiry: expiryDateString,
        fssaiImage: null,
        accountNumber: "1234567890123",
        confirmAccountNumber: "1234567890123",
        ifscCode: "HDFC0001234",
        accountHolderName: "John Doe",
        accountType: "savings",
      })
      toast.success("Step 3 filled with dummy data", { duration: 2000 })
    } else if (step === 4) {
      setStep4({
        estimatedDeliveryTime: "25-30 mins",
        featuredDish: "Butter Chicken Special",
        featuredPrice: "249",
        offer: "Flat Rs50 OFF above Rs199",
      })
      toast.success("Step 4 filled with dummy data", { duration: 2000 })
    }
  }

  const handleNext = async () => {
    setError("")

    // Validate current step before proceeding
    let validationErrors = []
    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    } else if (step === 4) {
      validationErrors = validateStep4()
      console.log('Step 4 validation:', {
        step4,
        errors: validationErrors,
        estimatedDeliveryTime: step4.estimatedDeliveryTime || "",
        featuredDish: step4.featuredDish || "",
        featuredPrice: step4.featuredPrice,
        offer: step4.offer
      })
    }

    if (validationErrors.length > 0) {
      // Show error toast for each validation error
      validationErrors.forEach((error, index) => {
        setTimeout(() => {
          toast.error(error, {
            duration: 4000,
          })
        }, index * 100)
      })
      console.log('Validation failed:', validationErrors)
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        const payload = {
          step1,
          completedSteps: 1,
        }
        await api.put("/restaurant/onboarding", payload)
        setStep(2)
      } else if (step === 2) {
        const menuUploads = []
        // Upload menu images if they are File objects
        for (const file of step2.menuImages.filter((f) => f instanceof File)) {
          try {
            const uploaded = await handleUpload(file, "mobasket/restaurant/menu")
            // Verify upload was successful and has valid URL
            if (!uploaded || !uploaded.url) {
              throw new Error(`Failed to upload menu image: ${file.name}`)
            }
            menuUploads.push(uploaded)
          } catch (uploadError) {
            console.error('Menu image upload error:', uploadError)
            throw new Error(`Failed to upload menu image: ${uploadError.message}`)
          }
        }
        // If menuImages already have URLs (from previous save), include them
        const existingMenuUrls = step2.menuImages.filter((img) => !(img instanceof File) && (img?.url || (typeof img === 'string' && img.startsWith('http'))))
        const allMenuUrls = [...existingMenuUrls, ...menuUploads]

        // Upload profile image if it's a File object
        let profileUpload = null
        if (step2.profileImage instanceof File) {
          try {
            profileUpload = await handleUpload(step2.profileImage, "mobasket/restaurant/profile")
            // Verify upload was successful and has valid URL
            if (!profileUpload || !profileUpload.url) {
              throw new Error('Failed to upload profile image')
            }
          } catch (uploadError) {
            console.error('Profile image upload error:', uploadError)
            throw new Error(`Failed to upload profile image: ${uploadError.message}`)
          }
        } else if (step2.profileImage?.url) {
          // If profileImage already has a URL (from previous save), use it
          profileUpload = step2.profileImage
        } else if (typeof step2.profileImage === 'string' && step2.profileImage.startsWith('http')) {
          // If it's a direct URL string
          profileUpload = { url: step2.profileImage }
        }

        const payload = {
          step2: {
            menuImageUrls: allMenuUrls.length > 0 ? allMenuUrls : [],
            profileImageUrl: profileUpload,
            cuisines: step2.cuisines || [],
            deliveryTimings: {
              openingTime: step2.openingTime || "",
              closingTime: step2.closingTime || "",
            },
            openDays: step2.openDays || [],
          },
          completedSteps: 2,
        }
        console.log('Step2 payload:', {
          menuImageUrlsCount: payload.step2.menuImageUrls.length,
          hasProfileImage: !!payload.step2.profileImageUrl,
          cuisines: payload.step2.cuisines,
          openDays: payload.step2.openDays,
          deliveryTimings: payload.step2.deliveryTimings,
        })

        const response = await api.put("/restaurant/onboarding", payload)
        console.log('Step2 response:', response?.data)

        // Verify response is successful
        if (!response || !response.data) {
          throw new Error('Invalid response from server')
        }

        // After step2, also update restaurant schema with step2 data
        // This ensures data is saved immediately, not just in onboarding subdocument
        if (response?.data?.data?.restaurant) {
          console.log('Step2 data saved and restaurant updated')
        }

        // Only proceed to step 3 if save was successful
        if (response?.data?.data?.onboarding || response?.data?.data) {
          console.log('Step2 completed successfully, moving to step 3')
          setStep(3)
        } else {
          throw new Error('Failed to save step2 data')
        }
      } else if (step === 3) {
        // Upload PAN image if it's a File object
        let panImageUpload = null
        if (step3.panImage instanceof File) {
          try {
            panImageUpload = await handleUpload(step3.panImage, "mobasket/restaurant/pan")
            // Verify upload was successful and has valid URL
            if (!panImageUpload || !panImageUpload.url) {
              throw new Error('Failed to upload PAN image')
            }
          } catch (uploadError) {
            console.error('PAN image upload error:', uploadError)
            throw new Error(`Failed to upload PAN image: ${uploadError.message}`)
          }
        } else if (step3.panImage?.url) {
          // If panImage already has a URL (from previous save), use it
          panImageUpload = step3.panImage
        } else if (typeof step3.panImage === 'string' && step3.panImage.startsWith('http')) {
          // If it's a direct URL string
          panImageUpload = { url: step3.panImage }
        }

        // Upload GST image if it's a File object (only if GST registered)
        let gstImageUpload = null
        if (step3.gstRegistered) {
          if (step3.gstImage instanceof File) {
            try {
              gstImageUpload = await handleUpload(step3.gstImage, "mobasket/restaurant/gst")
              // Verify upload was successful and has valid URL
              if (!gstImageUpload || !gstImageUpload.url) {
                throw new Error('Failed to upload GST image')
              }
            } catch (uploadError) {
              console.error('GST image upload error:', uploadError)
              throw new Error(`Failed to upload GST image: ${uploadError.message}`)
            }
          } else if (step3.gstImage?.url) {
            // If gstImage already has a URL (from previous save), use it
            gstImageUpload = step3.gstImage
          } else if (typeof step3.gstImage === 'string' && step3.gstImage.startsWith('http')) {
            // If it's a direct URL string
            gstImageUpload = { url: step3.gstImage }
          }

        }

        // Upload FSSAI image if it's a File object
        let fssaiImageUpload = null
        if (step3.fssaiImage instanceof File) {
          try {
            fssaiImageUpload = await handleUpload(step3.fssaiImage, "mobasket/restaurant/fssai")
            // Verify upload was successful and has valid URL
            if (!fssaiImageUpload || !fssaiImageUpload.url) {
              throw new Error('Failed to upload FSSAI image')
            }
          } catch (uploadError) {
            console.error('FSSAI image upload error:', uploadError)
            throw new Error(`Failed to upload FSSAI image: ${uploadError.message}`)
          }
        } else if (step3.fssaiImage?.url) {
          // If fssaiImage already has a URL (from previous save), use it
          fssaiImageUpload = step3.fssaiImage
        } else if (typeof step3.fssaiImage === 'string' && step3.fssaiImage.startsWith('http')) {
          // If it's a direct URL string
          fssaiImageUpload = { url: step3.fssaiImage }
        }

        const payload = {
          step3: {
            pan: {
              panNumber: step3.panNumber || "",
              nameOnPan: step3.nameOnPan || "",
              image: panImageUpload || null,
            },
            gst: {
              isRegistered: step3.gstRegistered || false,
              gstNumber: step3.gstNumber || "",
              legalName: step3.gstLegalName || "",
              address: step3.gstAddress || "",
              image: gstImageUpload,
            },
            fssai: {
              registrationNumber: step3.fssaiNumber || "",
              expiryDate: step3.fssaiExpiry || null,
              image: fssaiImageUpload || null,
            },
            bank: {
              accountNumber: step3.accountNumber || "",
              ifscCode: step3.ifscCode || "",
              accountHolderName: step3.accountHolderName || "",
              accountType: step3.accountType || "",
            },
          },
          completedSteps: 3,
        }
        console.log('Step3 payload:', {
          hasPan: !!payload.step3.pan.panNumber,
          hasGst: payload.step3.gst.isRegistered,
          hasFssai: !!payload.step3.fssai.registrationNumber,
          hasBank: !!payload.step3.bank.accountNumber,
        })

        const response = await api.put("/restaurant/onboarding", payload)
        console.log('Step3 response:', response?.data)

        if (response?.data?.data?.onboarding) {
          console.log('Step3 data saved successfully')
        }
        setStep(4)
      } else if (step === 4) {
        console.log('Submitting Step 4:', step4)
        const payload = {
          step4: {
            estimatedDeliveryTime: step4.estimatedDeliveryTime || "",
            featuredDish: step4.featuredDish || "",
            featuredPrice: step4.featuredPrice === "" || step4.featuredPrice === null || step4.featuredPrice === undefined ? null : Number(step4.featuredPrice),
            offer: step4.offer || "",
          },
          completedSteps: 4,
        }
        console.log('Step 4 payload:', payload)
        const response = await api.put("/restaurant/onboarding", payload)
        console.log('Step4 completed, response:', response?.data)

        // Verify response is successful
        if (!response || !response.data) {
          throw new Error('Invalid response from server')
        }

        try {
          const cachedRaw = localStorage.getItem("restaurant_user")
          const cachedRestaurant = cachedRaw ? JSON.parse(cachedRaw) : {}
          const responseRestaurant = response?.data?.data?.restaurant || {}
          const responseOnboarding = response?.data?.data?.onboarding || {}

          localStorage.setItem(
            "restaurant_user",
            JSON.stringify({
              ...cachedRestaurant,
              ...responseRestaurant,
              onboarding: {
                ...(cachedRestaurant?.onboarding || {}),
                ...responseOnboarding,
                completedSteps: 4,
              },
            }),
          )
          window.dispatchEvent(new Event("restaurantAuthChanged"))
          window.dispatchEvent(new Event("restaurantProfileRefresh"))
        } catch (storageError) {
          console.error("Failed to update cached restaurant after onboarding:", storageError)
        }

        // Clear localStorage when onboarding is complete
        clearOnboardingFromLocalStorage()

        // Show success message briefly, then navigate
        console.log('Onboarding completed successfully, redirecting to restaurant home...')

        // Wait a moment to ensure data is saved, then navigate
        setTimeout(() => {
          // Navigate to restaurant home page after onboarding completion
          console.log('Navigating to restaurant home page...')
          navigate("/restaurant", { replace: true })
        }, 800)
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const toggleCuisine = (cuisine) => {
    setStep2((prev) => {
      const exists = prev.cuisines.includes(cuisine)
      if (exists) {
        return { ...prev, cuisines: prev.cuisines.filter((c) => c !== cuisine) }
      }
      if (prev.cuisines.length >= 3) return prev
      return { ...prev, cuisines: [...prev.cuisines, cuisine] }
    })
  }

  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      if (exists) {
        return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
      }
      return { ...prev, openDays: [...prev.openDays, day] }
    })
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
        <p className="text-sm text-gray-600 mb-4">Restaurant name</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-700">Restaurant name*</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Customers will see this name"
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
        <p className="text-sm text-gray-600 mb-4">
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => {
                // Allow only letters, spaces, hyphens
                const val = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                setStep1({ ...step1, ownerName: val })
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Owner full name"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Email address*</Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Phone number*</Label>
            <Input
              type="tel"
              inputMode="numeric"
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                // Allow digits only
                const val = e.target.value.replace(/\D/g, "")
                setStep1({ ...step1, ownerPhone: val })
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="9876543210"
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
        <div>
          <Label className="text-xs text-gray-700">Primary contact number*</Label>
          <Input
            type="tel"
            inputMode="numeric"
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              // Allow digits only
              const val = e.target.value.replace(/\D/g, "")
              setStep1({ ...step1, primaryContactNumber: val })
            }}
            className="mt-1 bg-white text-sm text-black placeholder-black"
            placeholder="Restaurant's primary contact number"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Customers, delivery partners and {companyName} may call on this number for order
            support.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add your restaurant's location for order pick-up.
          </p>
          <Input
            value={step1.location?.area || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, area: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Area / Sector / Locality*"
          />
          <Input
            value={step1.location?.city || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, city: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="City"
          />
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine1: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Shop no. / building no. (optional)"
          />
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine2: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Floor / tower (optional)"
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, landmark: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Nearby landmark (optional)"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Please ensure that this address is the same as mentioned on your FSSAI license.
          </p>
        </div>
      </section>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Images section */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <p className="text-xs text-gray-500">
          Add clear photos of your printed menu and a primary profile image. This helps customers
          understand what you serve.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex items-center justify-between flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload menu images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP
                </span>
              </div>
            </div>
            <label
              htmlFor="menuImagesInput"
              className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black  border-black text-xs font-medium cursor-pointer     w-full items-center"
            >
              <Upload className="w-4.5 h-4.5" />
              <span>Choose file</span>
            </label>
            <input
              id="menuImagesInput"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                const selectedFile = files[0]
                console.log('Menu image selected:', selectedFile?.name || '1 file')
                setStep2((prev) => ({
                  ...prev,
                  menuImages: [selectedFile],
                }))
                // Reset input to allow selecting same file again
                e.target.value = ''
              }}
            />
          </div>

          {/* Menu image previews */}
          {!!step2.menuImages.length && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (file instanceof File) {
                  imageUrl = URL.createObjectURL(file)
                  imageName = file.name
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file
                }

                return (
                  <div
                    key={idx}
                    className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile image */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
              {step2.profileImage ? (
                (() => {
                  let imageSrc = null;

                  if (step2.profileImage instanceof File) {
                    imageSrc = URL.createObjectURL(step2.profileImage);
                  } else if (step2.profileImage?.url) {
                    // If it's an object with url property (from backend)
                    imageSrc = step2.profileImage.url;
                  } else if (typeof step2.profileImage === 'string') {
                    // If it's a direct URL string
                    imageSrc = step2.profileImage;
                  }

                  return imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="Restaurant profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-500" />
                  );
                })()
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div className="flex-1 flex-col flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload profile image</span>
                <span className="text-[11px] text-gray-500">
                  This will be shown on your listing card and restaurant page.
                </span>
              </div>

            </div>

          </div>
          <label
            htmlFor="profileImageInput"
            className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black  border-black text-xs font-medium cursor-pointer     w-full items-center"
          >
            <Upload className="w-4.5 h-4.5" />
            <span>Upload</span>
          </label>
          <input
            id="profileImageInput"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                console.log('Profile image selected:', file.name)
                setStep2((prev) => ({
                  ...prev,
                  profileImage: file,
                }))
              }
              // Reset input to allow selecting same file again
              e.target.value = ''
            }}
          />
        </div>
      </section>

      {/* Operational details */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        {/* Cuisines */}
        <div>
          <Label className="text-xs text-gray-700">Select cuisines (up to 3)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisinesOptions.map((cuisine) => {
              const active = step2.cuisines.includes(cuisine)
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                    }`}
                >
                  {cuisine}
                </button>
              )
            })}
          </div>
        </div>

        {/* Timings with popover time selectors */}
        <div className="space-y-3">
          <Label className="text-xs text-gray-700">Delivery timings</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeSelector
              label="Opening time"
              value={step2.openingTime || ""}
              onChange={(val) => setStep2({ ...step2, openingTime: val || "" })}
            />
            <TimeSelector
              label="Closing time"
              value={step2.closingTime || ""}
              onChange={(val) => setStep2({ ...step2, closingTime: val || "" })}
            />
          </div>
        </div>

        {/* Open days in a calendar-like grid */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days</span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts delivery orders.
          </p>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                    }`}
                >
                  {day.charAt(0)}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Reusable styled file upload box
    const FileUploadBox = ({ id, file, onFileChange, label }) => {
      const fileName = file instanceof File ? file.name : (file?.name || null)
      return (
        <div>
          {label && <Label className="text-xs text-gray-700 mb-1 block">{label}</Label>}
          <div className="border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex flex-col items-center gap-2">
            {fileName ? (
              <div className="flex items-center gap-2 w-full">
                <ImageIcon className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-800 truncate flex-1">{fileName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-500">No file chosen</span>
              </div>
            )}
            <label
              htmlFor={id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white border border-gray-300 text-black text-xs font-medium cursor-pointer w-full justify-center"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{fileName ? "Choose another file" : "Choose file"}</span>
            </label>
            <input
              id={id}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                if (f) onFileChange(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">PAN details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">PAN number*</Label>
              <Input
                value={step3.panNumber || ""}
                onChange={(e) => {
                  // Uppercase, allow only A-Z and 0-9, max 10 chars
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
                  setStep3({ ...step3, panNumber: val })
                }}
                className="mt-1 bg-white text-sm text-black placeholder-black"
                placeholder="ABCDE1234F"
                maxLength={10}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Name on PAN*</Label>
              <Input
                value={step3.nameOnPan || ""}
                onChange={(e) => {
                  // Allow only letters, spaces, hyphens
                  const val = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                  setStep3({ ...step3, nameOnPan: val })
                }}
                className="mt-1 bg-white text-sm text-black placeholder-black"
                placeholder="Name as on PAN card"
              />
            </div>
          </div>
          <FileUploadBox
            id="panImageInput"
            label="PAN image*"
            file={step3.panImage}
            onFileChange={(f) => setStep3({ ...step3, panImage: f })}
          />
        </section>

        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">GST details</h2>
          <div className="flex gap-4 items-center text-sm">
            <span className="text-gray-700">GST registered?</span>
            <button
              type="button"
              onClick={() => setStep3({ ...step3, gstRegistered: true })}
              className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setStep3({ ...step3, gstRegistered: false })}
              className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                }`}
            >
              No
            </button>
          </div>
          {step3.gstRegistered && (
            <div className="space-y-3">
              <Input
                value={step3.gstNumber || ""}
                onChange={(e) => setStep3({ ...step3, gstNumber: e.target.value })}
                className="bg-white text-sm"
                placeholder="GST number"
              />
              <Input
                value={step3.gstLegalName || ""}
                onChange={(e) => setStep3({ ...step3, gstLegalName: e.target.value })}
                className="bg-white text-sm"
                placeholder="Legal name"
              />
              <Input
                value={step3.gstAddress || ""}
                onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })}
                className="bg-white text-sm"
                placeholder="Registered address"
              />
              <FileUploadBox
                id="gstImageInput"
                label="GST certificate image*"
                file={step3.gstImage}
                onFileChange={(f) => setStep3({ ...step3, gstImage: f })}
              />
            </div>
          )}
        </section>

        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">FSSAI number*</Label>
              <Input
                value={step3.fssaiNumber || ""}
                onChange={(e) => {
                  // Digits only, max 14 chars
                  const val = e.target.value.replace(/\D/g, "").slice(0, 14)
                  setStep3({ ...step3, fssaiNumber: val })
                }}
                className="bg-white text-sm"
                placeholder="14-digit FSSAI number"
                inputMode="numeric"
                maxLength={14}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date*</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-sm text-left flex items-center justify-between hover:bg-gray-50"
                  >
                    <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-500"}>
                      {step3.fssaiExpiry
                        ? new Date(step3.fssaiExpiry).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                        : "Select expiry date"}
                    </span>
                    <CalendarIcon className="w-4 h-4 text-gray-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={step3.fssaiExpiry ? new Date(step3.fssaiExpiry) : undefined}
                    disabled={(date) => date < today}
                    onSelect={(date) => {
                      if (date) {
                        const formattedDate = date.toISOString().split("T")[0]
                        setStep3({ ...step3, fssaiExpiry: formattedDate })
                      }
                    }}
                    initialFocus
                    className="rounded-md border border-gray-200"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <FileUploadBox
            id="fssaiImageInput"
            label="FSSAI certificate image"
            file={step3.fssaiImage}
            onFileChange={(f) => setStep3({ ...step3, fssaiImage: f })}
          />
        </section>

        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">Bank account details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">Account number*</Label>
              <Input
                inputMode="numeric"
                value={step3.accountNumber || ""}
                onChange={(e) => {
                  // Digits only
                  const val = e.target.value.replace(/\D/g, "")
                  setStep3({ ...step3, accountNumber: val })
                }}
                className="bg-white text-sm"
                placeholder="Account number"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Re-enter account number*</Label>
              <Input
                inputMode="numeric"
                value={step3.confirmAccountNumber || ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "")
                  setStep3({ ...step3, confirmAccountNumber: val })
                }}
                className="bg-white text-sm"
                placeholder="Confirm account number"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">IFSC code*</Label>
              <Input
                value={step3.ifscCode || ""}
                onChange={(e) => {
                  // Uppercase, allow only A-Z and 0-9, max 11 chars
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
                  setStep3({ ...step3, ifscCode: val })
                }}
                className="bg-white text-sm"
                placeholder="HDFC0001234"
                maxLength={11}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Account type*</Label>
              <Select
                value={step3.accountType || ""}
                onValueChange={(val) => setStep3({ ...step3, accountType: val })}
              >
                <SelectTrigger className="bg-white text-sm h-9">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-700">Account holder name*</Label>
            <Input
              value={step3.accountHolderName || ""}
              onChange={(e) => {
                // Allow only letters, spaces, hyphens
                const val = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                setStep3({ ...step3, accountHolderName: val })
              }}
              className="bg-white text-sm"
              placeholder="Account holder name"
            />
          </div>
        </section>
      </div>
    )
  }


  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
        <p className="text-sm text-gray-600">
          Add information that will be displayed to customers on the home page
        </p>

        <div>
          <Label className="text-xs text-gray-700">Estimated Delivery Time*</Label>
          <Input
            value={step4.estimatedDeliveryTime || ""}
            onChange={(e) => setStep4({ ...step4, estimatedDeliveryTime: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., 25-30 mins"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Name*</Label>
          <Input
            value={step4.featuredDish || ""}
            onChange={(e) => setStep4({ ...step4, featuredDish: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., Butter Chicken Special"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Price (Rs)*</Label>
          <Input
            type="number"
            value={step4.featuredPrice || ""}
            onChange={(e) => setStep4({ ...step4, featuredPrice: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., 249"
            min="0"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Special Offer/Promotion*</Label>
          <Input
            value={step4.offer || ""}
            onChange={(e) => setStep4({ ...step4, offer: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., Flat Rs50 OFF above Rs199"
          />
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    return renderStep4()
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
          <div className="text-sm font-semibold text-black">Restaurant onboarding</div>
          <div className="flex items-center gap-3">
            {import.meta.env.DEV && (
              <Button
                onClick={fillDummyData}
                variant="outline"
                size="sm"
                className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 flex items-center gap-1.5"
                title="Fill with dummy data (Dev only)"
              >
                <Sparkles className="w-3 h-3" />
                Fill Dummy
              </Button>
            )}
            <div className="text-xs text-gray-600">
              Step {step} of 4
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            renderStep()
          )}
        </main>

        {error && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <footer className="px-4 sm:px-6 py-3 bg-white">
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setShowBackPopup(true)}
              className="text-sm text-gray-700 bg-transparent"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving}
              className="text-sm bg-black text-white px-6"
            >
              {step === 4 ? (saving ? "Saving..." : "Finish") : saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </footer>

        {/* Confirmation Popup */}
        {showBackPopup && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-scale-95 duration-300">
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ArrowLeft className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Abandon Signup?</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to go back without completing the signup process? Your progress will be cleared.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setShowBackPopup(false)}
                    className="w-full py-3.5 bg-black text-white font-bold rounded-xl hover:bg-gray-900 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Continue Signup
                  </button>
                  <button
                    onClick={() => {
                      clearRestaurantSignupSession()
                      navigate("/restaurant/login", { replace: true })
                    }}
                    className="w-full py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </LocalizationProvider>
  )
}




