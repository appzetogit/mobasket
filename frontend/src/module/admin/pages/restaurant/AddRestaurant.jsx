import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, Info, Tag, Upload, Calendar, FileText, MapPin, CheckCircle2, X, Image as ImageIcon, Clock, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { adminAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

const cuisinesOptions = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Pizza",
  "Burgers",
  "Bakery",
  "Cafe",
]

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const OWNER_NAME_REGEX = /^[A-Za-z\s-]+$/
const OWNER_PHONE_REGEX = /^\d{10}$/
const PINCODE_REGEX = /^\d{6}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_REGEX = /^\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_REGEX = /^\d{14}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

const getOwnerPhoneError = (value) => {
  const phone = String(value || "").trim()
  if (!phone) return "Owner phone number is required"
  if (!OWNER_PHONE_REGEX.test(phone)) return "Phone number must be 10 digits only"
  return ""
}

const getPrimaryContactNumberError = (value) => {
  const phone = String(value || "").trim()
  if (!phone) return "Primary contact number is required"
  if (!OWNER_PHONE_REGEX.test(phone)) return "Primary contact number must be 10 digits only"
  return ""
}

const getMenuImagesError = (menuImages) => {
  if (!Array.isArray(menuImages) || menuImages.length === 0) return "At least one menu image is required"
  return ""
}

const getProfileImageError = (profileImage) => {
  if (!profileImage) return "Restaurant profile image is required"
  return ""
}

const getPanNumberError = (value) => {
  const panNumber = String(value || "").trim().toUpperCase()
  if (!panNumber) return "PAN number is required"
  if (!PAN_REGEX.test(panNumber)) return "PAN number must be in ABCDE1234F format"
  return ""
}

const getPanHolderNameError = (value) => {
  const name = String(value || "").trim()
  if (!name) return "Name on PAN is required"
  if (!OWNER_NAME_REGEX.test(name)) return "Name on PAN should contain only letters, spaces, and hyphens"
  return ""
}

const getGstNumberError = (value, gstRegistered) => {
  if (!gstRegistered) return ""
  const gstNumber = String(value || "").trim().toUpperCase()
  if (!gstNumber) return "GST number is required when GST registered"
  if (!GST_REGEX.test(gstNumber)) return "GST number must be in 22ABCDE1234F1Z5 format"
  return ""
}

const getGstLegalNameError = (value, gstRegistered) => {
  if (!gstRegistered) return ""
  const legalName = String(value || "").trim()
  if (!legalName) return "GST legal name is required when GST registered"
  if (!OWNER_NAME_REGEX.test(legalName)) {
    return "GST legal name should contain only letters, spaces, and hyphens"
  }
  return ""
}

const getFssaiNumberError = (value) => {
  const fssaiNumber = String(value || "").trim()
  if (!fssaiNumber) return ""
  if (!FSSAI_REGEX.test(fssaiNumber)) return "FSSAI number must be 14 digits"
  return ""
}

const getFssaiExpiryError = (value, todayDateString) => {
  const expiryDate = String(value || "").trim()
  if (!expiryDate) return ""
  if (expiryDate < todayDateString) return "FSSAI expiry date cannot be in the past"
  return ""
}

const getIfscCodeError = (value) => {
  const ifscCode = String(value || "").trim().toUpperCase()
  if (!ifscCode) return "IFSC code is required"
  if (!IFSC_REGEX.test(ifscCode)) return "IFSC code must be in HDFC0001234 format"
  return ""
}

const getAccountHolderNameError = (value) => {
  const accountHolderName = String(value || "").trim()
  if (!accountHolderName) return "Account holder name is required"
  if (!OWNER_NAME_REGEX.test(accountHolderName)) {
    return "Account holder name should contain only letters, spaces, and hyphens"
  }
  return ""
}

const toSlotFormat = (time24) => {
  if (!time24 || typeof time24 !== "string" || !time24.includes(":")) return null
  const [rawHour, rawMinute] = time24.split(":").map(Number)
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return null
  const period = rawHour >= 12 ? "pm" : "am"
  const hour12 = rawHour % 12 || 12
  return {
    time: `${hour12}:${String(rawMinute).padStart(2, "0")}`,
    period,
  }
}

const buildDefaultOutletTimings = () =>
  dayNames.map((day) => ({
    day,
    isOpen: true,
    slots: [{ id: `${day}-1`, start: "09:00", end: "22:00" }],
  }))

const buildOutletTimingsPayload = (editorTimings = []) =>
  dayNames.map((day) => {
    const entry = (Array.isArray(editorTimings) ? editorTimings : []).find((item) => item?.day === day) || {
      day,
      isOpen: true,
      slots: [],
    }
    const normalizedSlots = (Array.isArray(entry.slots) ? entry.slots : [])
      .map((slot) => {
        const start = toSlotFormat(slot?.start)
        const end = toSlotFormat(slot?.end)
        if (!start || !end) return null
        return {
          start: start.time,
          startPeriod: start.period,
          end: end.time,
          endPeriod: end.period,
        }
      })
      .filter(Boolean)
      .slice(0, 3)

    const firstStart = normalizedSlots[0]
    const lastEnd = normalizedSlots[normalizedSlots.length - 1]
    return {
      day,
      isOpen: entry?.isOpen !== false,
      openingTime: firstStart ? entry.slots?.[0]?.start || "09:00" : "09:00",
      closingTime: lastEnd ? entry.slots?.[entry.slots.length - 1]?.end || "22:00" : "22:00",
      slots: normalizedSlots,
    }
  })

export default function AddRestaurant() {
  const navigate = useNavigate()
  const today = new Date()
  const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  
  // Step 1: Basic Info
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
      state: "",
      pincode: "",
      landmark: "",
    },
  })

  // Step 2: Images & Operational
  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: "09:00",
    closingTime: "22:00",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    outletTimings: buildDefaultOutletTimings(),
  })

  // Step 3: Documents
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

  // Step 4: Display Info
  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "25-30 mins",
    featuredDish: "",
    featuredPrice: "249",
    offer: "",
  })

  // Authentication
  const [auth, setAuth] = useState({
    email: "",
    phone: "",
    signupMethod: "email",
  })


  // Upload handler for images
  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      console.error("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions
  const validateStep1 = () => {
    const errors = []
    if (!step1.restaurantName?.trim()) errors.push("Restaurant name is required")
    if (!step1.ownerName?.trim()) errors.push("Owner name is required")
    if (step1.ownerName?.trim() && !OWNER_NAME_REGEX.test(step1.ownerName.trim())) {
      errors.push("Full name should contain only letters, spaces, and hyphens")
    }
    if (!step1.ownerEmail?.trim()) errors.push("Owner email is required")
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.ownerEmail)) errors.push("Please enter a valid email address")
    const ownerPhoneError = getOwnerPhoneError(step1.ownerPhone)
    if (ownerPhoneError) errors.push(ownerPhoneError)
    const primaryContactNumberError = getPrimaryContactNumberError(step1.primaryContactNumber)
    if (primaryContactNumberError) errors.push(primaryContactNumberError)
    if (!step1.location?.area?.trim()) errors.push("Area/Sector/Locality is required")
    if (!step1.location?.city?.trim()) errors.push("City is required")
    if (step1.location?.pincode?.trim() && !PINCODE_REGEX.test(step1.location.pincode.trim())) {
      errors.push("Pin code must be 6 digits")
    }
    return errors
  }

  const validateStep2 = () => {
    const errors = []
    const menuImagesError = getMenuImagesError(step2.menuImages)
    if (menuImagesError) errors.push(menuImagesError)
    const profileImageError = getProfileImageError(step2.profileImage)
    if (profileImageError) errors.push(profileImageError)
    if (!step2.cuisines || step2.cuisines.length === 0) errors.push("Please select at least one cuisine")
    const openDayEntries = (Array.isArray(step2.outletTimings) ? step2.outletTimings : []).filter((d) => d?.isOpen !== false)
    if (openDayEntries.length === 0) errors.push("Please keep at least one day open in outlet timings")
    openDayEntries.forEach((dayEntry) => {
      if (!Array.isArray(dayEntry.slots) || dayEntry.slots.length === 0) {
        errors.push(`Please add at least one slot for ${dayEntry.day}`)
      }
    })
    return errors
  }

  const validateStep3 = () => {
    const errors = []
    const panNumberError = getPanNumberError(step3.panNumber)
    if (panNumberError) errors.push(panNumberError)
    const panHolderNameError = getPanHolderNameError(step3.nameOnPan)
    if (panHolderNameError) errors.push(panHolderNameError)
    const fssaiNumberError = getFssaiNumberError(step3.fssaiNumber)
    if (fssaiNumberError) errors.push(fssaiNumberError)
    const fssaiExpiryError = getFssaiExpiryError(step3.fssaiExpiry, todayDateString)
    if (fssaiExpiryError) errors.push(fssaiExpiryError)
    if (step3.gstRegistered) {
      const gstNumberError = getGstNumberError(step3.gstNumber, step3.gstRegistered)
      if (gstNumberError) errors.push(gstNumberError)
      const gstLegalNameError = getGstLegalNameError(step3.gstLegalName, step3.gstRegistered)
      if (gstLegalNameError) errors.push(gstLegalNameError)
      if (!step3.gstAddress?.trim()) errors.push("GST registered address is required when GST registered")
      if (!step3.gstImage) errors.push("GST image is required when GST registered")
    }
    if (!step3.accountNumber?.trim()) errors.push("Account number is required")
    if (step3.accountNumber !== step3.confirmAccountNumber) errors.push("Account number and confirmation do not match")
    const ifscCodeError = getIfscCodeError(step3.ifscCode)
    if (ifscCodeError) errors.push(ifscCodeError)
    const accountHolderNameError = getAccountHolderNameError(step3.accountHolderName)
    if (accountHolderNameError) errors.push(accountHolderNameError)
    if (!step3.accountType?.trim()) errors.push("Account type is required")
    return errors
  }

  const validateStep4 = () => {
    const errors = []
    if (!step4.estimatedDeliveryTime?.trim()) errors.push("Estimated delivery time is required")
    if (!step4.featuredDish?.trim()) errors.push("Featured dish name is required")
    if (!step4.featuredPrice || isNaN(parseFloat(step4.featuredPrice)) || parseFloat(step4.featuredPrice) <= 0) {
      errors.push("Featured dish price is required and must be greater than 0")
    }
    if (!step4.offer?.trim()) errors.push("Special offer/promotion is required")
    return errors
  }

  const validateAuth = () => {
    const errors = []
    if (!auth.email && !auth.phone) errors.push("Either email or phone is required")
    if (auth.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auth.email)) errors.push("Please enter a valid email address")
    return errors
  }

  const handleNext = () => {
    setFormErrors({})
    let validationErrors = []
    let nextFormErrors = {}
    
    if (step === 1) {
      validationErrors = validateStep1()
      const ownerPhoneError = getOwnerPhoneError(step1.ownerPhone)
      if (ownerPhoneError) {
        nextFormErrors.ownerPhone = ownerPhoneError
        validationErrors = validationErrors.filter((error) => error !== ownerPhoneError)
      }
      const primaryContactNumberError = getPrimaryContactNumberError(step1.primaryContactNumber)
      if (primaryContactNumberError) {
        nextFormErrors.primaryContactNumber = primaryContactNumberError
        validationErrors = validationErrors.filter((error) => error !== primaryContactNumberError)
      }
    } else if (step === 2) {
      validationErrors = validateStep2()
      const menuImagesError = getMenuImagesError(step2.menuImages)
      if (menuImagesError) {
        nextFormErrors.menuImages = menuImagesError
      }
      const profileImageError = getProfileImageError(step2.profileImage)
      if (profileImageError) {
        nextFormErrors.profileImage = profileImageError
      }
    } else if (step === 3) {
      validationErrors = validateStep3()
      const panNumberError = getPanNumberError(step3.panNumber)
      if (panNumberError) {
        nextFormErrors.panNumber = panNumberError
        validationErrors = validationErrors.filter((error) => error !== panNumberError)
      }
      const panHolderNameError = getPanHolderNameError(step3.nameOnPan)
      if (panHolderNameError) {
        nextFormErrors.nameOnPan = panHolderNameError
        validationErrors = validationErrors.filter((error) => error !== panHolderNameError)
      }
      const gstNumberError = getGstNumberError(step3.gstNumber, step3.gstRegistered)
      if (gstNumberError) {
        nextFormErrors.gstNumber = gstNumberError
        validationErrors = validationErrors.filter((error) => error !== gstNumberError)
      }
      const gstLegalNameError = getGstLegalNameError(step3.gstLegalName, step3.gstRegistered)
      if (gstLegalNameError) {
        nextFormErrors.gstLegalName = gstLegalNameError
        validationErrors = validationErrors.filter((error) => error !== gstLegalNameError)
      }
      const fssaiNumberError = getFssaiNumberError(step3.fssaiNumber)
      if (fssaiNumberError) {
        nextFormErrors.fssaiNumber = fssaiNumberError
        validationErrors = validationErrors.filter((error) => error !== fssaiNumberError)
      }
      const fssaiExpiryError = getFssaiExpiryError(step3.fssaiExpiry, todayDateString)
      if (fssaiExpiryError) {
        nextFormErrors.fssaiExpiry = fssaiExpiryError
        validationErrors = validationErrors.filter((error) => error !== fssaiExpiryError)
      }
      const ifscCodeError = getIfscCodeError(step3.ifscCode)
      if (ifscCodeError) {
        nextFormErrors.ifscCode = ifscCodeError
        validationErrors = validationErrors.filter((error) => error !== ifscCodeError)
      }
      const accountHolderNameError = getAccountHolderNameError(step3.accountHolderName)
      if (accountHolderNameError) {
        nextFormErrors.accountHolderName = accountHolderNameError
        validationErrors = validationErrors.filter((error) => error !== accountHolderNameError)
      }
    } else if (step === 4) {
      validationErrors = validateStep4()
    } else if (step === 5) {
      validationErrors = validateAuth()
    }
    
    if (Object.keys(nextFormErrors).length > 0) {
      setFormErrors(nextFormErrors)
    }

    if (validationErrors.length > 0 || Object.keys(nextFormErrors).length > 0) {
      validationErrors.forEach((error) => {
        toast.error(error)
      })
      return
    }
    
    if (step < 5) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (step === 1) {
      navigate("/admin/restaurants")
      return
    }
    setStep((s) => Math.max(1, s - 1))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setFormErrors({})
    
    try {
      // Upload all images first
      let profileImageData = null
      if (step2.profileImage instanceof File) {
        profileImageData = await handleUpload(step2.profileImage, "mobasket/restaurant/profile")
      } else if (step2.profileImage?.url) {
        profileImageData = step2.profileImage
      }

      let menuImagesData = []
      for (const file of step2.menuImages.filter(f => f instanceof File)) {
        const uploaded = await handleUpload(file, "mobasket/restaurant/menu")
        menuImagesData.push(uploaded)
      }
      const existingMenuUrls = step2.menuImages.filter(img => !(img instanceof File) && (img?.url || (typeof img === 'string' && img.startsWith('http'))))
      menuImagesData = [...existingMenuUrls, ...menuImagesData]

      let panImageData = null
      if (step3.panImage instanceof File) {
        panImageData = await handleUpload(step3.panImage, "mobasket/restaurant/pan")
      } else if (step3.panImage?.url) {
        panImageData = step3.panImage
      }

      let gstImageData = null
      if (step3.gstRegistered && step3.gstImage) {
        if (step3.gstImage instanceof File) {
          gstImageData = await handleUpload(step3.gstImage, "mobasket/restaurant/gst")
        } else if (step3.gstImage?.url) {
          gstImageData = step3.gstImage
        }
      }

      let fssaiImageData = null
      if (step3.fssaiImage instanceof File) {
        fssaiImageData = await handleUpload(step3.fssaiImage, "mobasket/restaurant/fssai")
      } else if (step3.fssaiImage?.url) {
        fssaiImageData = step3.fssaiImage
      }

      const outletTimings = buildOutletTimingsPayload(step2.outletTimings)
      const openEntries = outletTimings.filter((entry) => entry.isOpen !== false)
      const derivedOpenDays = openEntries.map((entry) => entry.day.slice(0, 3))
      const firstOpen = openEntries[0]

      // Prepare payload
      const payload = {
        // Step 1
        restaurantName: step1.restaurantName,
        ownerName: step1.ownerName,
        ownerEmail: step1.ownerEmail,
        ownerPhone: step1.ownerPhone,
        primaryContactNumber: step1.primaryContactNumber,
        location: step1.location,
        // Step 2
        menuImages: menuImagesData,
        profileImage: profileImageData,
        cuisines: step2.cuisines,
        openingTime: firstOpen?.openingTime || "09:00",
        closingTime: firstOpen?.closingTime || "22:00",
        openDays: derivedOpenDays,
        outletTimings,
        // Step 3
        panNumber: step3.panNumber,
        nameOnPan: step3.nameOnPan,
        panImage: panImageData,
        gstRegistered: step3.gstRegistered,
        gstNumber: step3.gstNumber,
        gstLegalName: step3.gstLegalName,
        gstAddress: step3.gstAddress,
        gstImage: gstImageData,
        fssaiNumber: step3.fssaiNumber,
        fssaiExpiry: step3.fssaiExpiry,
        fssaiImage: fssaiImageData,
        accountNumber: step3.accountNumber,
        ifscCode: step3.ifscCode,
        accountHolderName: step3.accountHolderName,
        accountType: step3.accountType,
        // Step 4
        estimatedDeliveryTime: step4.estimatedDeliveryTime,
        featuredDish: step4.featuredDish,
        featuredPrice: parseFloat(step4.featuredPrice) || 249,
        offer: step4.offer,
        // Auth
        email: auth.email || null,
        phone: auth.phone || null,
        signupMethod: auth.email ? 'email' : 'phone',
      }

      // Call backend API
      const response = await adminAPI.createRestaurant(payload)
      
      if (response.data.success) {
        toast.success("Restaurant created successfully!")
        setShowSuccessDialog(true)
        setTimeout(() => {
          navigate("/admin/restaurants")
        }, 2000)
      } else {
        throw new Error(response.data.message || "Failed to create restaurant")
      }
    } catch (error) {
      console.error("Error creating restaurant:", error)
      const errorMsg = error?.response?.data?.message || error?.message || "Failed to create restaurant. Please try again."
      toast.error(errorMsg)
      setFormErrors({ submit: errorMsg })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Render functions for each step
  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
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
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) =>
                setStep1({ ...step1, ownerName: e.target.value.replace(/[^A-Za-z\s-]/g, "") })
              }
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
              maxLength={10}
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const phone = e.target.value.replace(/\D/g, "").slice(0, 10)
                setStep1({ ...step1, ownerPhone: phone })
                if (formErrors.ownerPhone) {
                  setFormErrors((prev) => ({ ...prev, ownerPhone: getOwnerPhoneError(phone) }))
                }
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="9876543210"
            />
            {formErrors.ownerPhone && (
              <div className="mt-1 text-xs text-red-600">{formErrors.ownerPhone}</div>
            )}
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
            maxLength={10}
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const phone = e.target.value.replace(/\D/g, "").slice(0, 10)
              setStep1({ ...step1, primaryContactNumber: phone })
              if (formErrors.primaryContactNumber) {
                setFormErrors((prev) => ({
                  ...prev,
                  primaryContactNumber: getPrimaryContactNumberError(phone),
                }))
              }
            }}
            className="mt-1 bg-white text-sm text-black placeholder-black"
            placeholder="9876543210"
          />
          {formErrors.primaryContactNumber && (
            <div className="mt-1 text-xs text-red-600">{formErrors.primaryContactNumber}</div>
          )}
        </div>
        <div className="space-y-3">
          <Input
            value={step1.location?.area || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, area: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Area / Sector / Locality*"
          />
          <Input
            value={step1.location?.city || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, city: e.target.value } })}
            className="bg-white text-sm"
            placeholder="City*"
          />
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine1: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Shop no. / building no. (optional)"
          />
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine2: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Floor / tower (optional)"
          />
          <Input
            value={step1.location?.state || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, state: e.target.value.replace(/[^A-Za-z\s]/g, "") },
              })
            }
            className="bg-white text-sm"
            placeholder="State (optional)"
          />
          <Input
            value={step1.location?.pincode || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) },
              })
            }
            className="bg-white text-sm"
            placeholder="Pin code (optional)"
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, landmark: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Nearby landmark (optional)"
          />
        </div>
      </section>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images*</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3">
            <label htmlFor="menuImagesInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border-black text-xs font-medium cursor-pointer w-full items-center">
              <Upload className="w-4.5 h-4.5" />
              <span>Choose files</span>
            </label>
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length) {
                  setStep2((prev) => ({ ...prev, menuImages: [...(prev.menuImages || []), ...files] }))
                  if (formErrors.menuImages) {
                    setFormErrors((prev) => ({ ...prev, menuImages: "" }))
                  }
                  e.target.value = ''
                }
              }}
            />
          </div>
          {formErrors.menuImages && (
            <div className="text-xs text-red-600">{formErrors.menuImages}</div>
          )}
          {step2.menuImages.length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                const imageUrl = file instanceof File ? URL.createObjectURL(file) : (file?.url || file)
                return (
                  <div key={idx} className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100">
                    {imageUrl && <img src={imageUrl} alt={`Menu ${idx + 1}`} className="w-full h-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => setStep2((prev) => ({ ...prev, menuImages: prev.menuImages.filter((_, i) => i !== idx) }))}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image*</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
              {step2.profileImage ? (
                (() => {
                  const imageSrc = step2.profileImage instanceof File ? URL.createObjectURL(step2.profileImage) : (step2.profileImage?.url || step2.profileImage)
                  return imageSrc ? <img src={imageSrc} alt="Profile" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-500" />
                })()
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <label htmlFor="profileImageInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border-black text-xs font-medium cursor-pointer">
              <Upload className="w-4.5 h-4.5" />
              <span>Upload</span>
            </label>
            <input
              id="profileImageInput"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                if (file) {
                  setStep2((prev) => ({ ...prev, profileImage: file }))
                  if (formErrors.profileImage) {
                    setFormErrors((prev) => ({ ...prev, profileImage: "" }))
                  }
                }
                e.target.value = ''
              }}
            />
          </div>
          {formErrors.profileImage && (
            <div className="text-xs text-red-600">{formErrors.profileImage}</div>
          )}
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <div>
          <Label className="text-xs text-gray-700">Select cuisines (up to 3)*</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisinesOptions.map((cuisine) => {
              const active = step2.cuisines.includes(cuisine)
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => {
                    setStep2((prev) => {
                      const exists = prev.cuisines.includes(cuisine)
                      if (exists) return { ...prev, cuisines: prev.cuisines.filter((c) => c !== cuisine) }
                      if (prev.cuisines.length >= 3) return prev
                      return { ...prev, cuisines: [...prev.cuisines, cuisine] }
                    })
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
                >
                  {cuisine}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-800" />
            <span>Outlet timings (single source of truth)*</span>
          </Label>
          <div className="space-y-2">
            {step2.outletTimings.map((dayEntry) => (
              <div key={dayEntry.day} className="rounded-md border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">{dayEntry.day}</p>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={dayEntry.isOpen !== false}
                      onChange={(e) =>
                        setStep2((prev) => ({
                          ...prev,
                          outletTimings: prev.outletTimings.map((entry) =>
                            entry.day === dayEntry.day ? { ...entry, isOpen: e.target.checked } : entry,
                          ),
                        }))
                      }
                    />
                    Open
                  </label>
                </div>

                {dayEntry.isOpen !== false && (
                  <div className="space-y-2">
                    {dayEntry.slots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={slot.start}
                          onChange={(e) =>
                            setStep2((prev) => ({
                              ...prev,
                              outletTimings: prev.outletTimings.map((entry) =>
                                entry.day === dayEntry.day
                                  ? {
                                      ...entry,
                                      slots: entry.slots.map((s) =>
                                        s.id === slot.id ? { ...s, start: e.target.value } : s,
                                      ),
                                    }
                                  : entry,
                              ),
                            }))
                          }
                          className="bg-white text-sm"
                        />
                        <span className="text-xs text-gray-500">to</span>
                        <Input
                          type="time"
                          value={slot.end}
                          onChange={(e) =>
                            setStep2((prev) => ({
                              ...prev,
                              outletTimings: prev.outletTimings.map((entry) =>
                                entry.day === dayEntry.day
                                  ? {
                                      ...entry,
                                      slots: entry.slots.map((s) =>
                                        s.id === slot.id ? { ...s, end: e.target.value } : s,
                                      ),
                                    }
                                  : entry,
                              ),
                            }))
                          }
                          className="bg-white text-sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setStep2((prev) => ({
                              ...prev,
                              outletTimings: prev.outletTimings.map((entry) => {
                                if (entry.day !== dayEntry.day || entry.slots.length <= 1) return entry
                                return { ...entry, slots: entry.slots.filter((s) => s.id !== slot.id) }
                              }),
                            }))
                          }
                          className="text-xs"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    {dayEntry.slots.length < 3 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setStep2((prev) => ({
                            ...prev,
                            outletTimings: prev.outletTimings.map((entry) =>
                              entry.day === dayEntry.day
                                ? {
                                    ...entry,
                                    slots: [
                                      ...entry.slots,
                                      { id: `${dayEntry.day}-${Date.now()}-${Math.random()}`, start: "09:00", end: "22:00" },
                                    ],
                                  }
                                : entry,
                            ),
                          }))
                        }
                        className="text-xs"
                      >
                        + Add slot
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">PAN details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700">PAN number*</Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => {
                const panNumber = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
                setStep3({ ...step3, panNumber })
                if (formErrors.panNumber) {
                  setFormErrors((prev) => ({ ...prev, panNumber: getPanNumberError(panNumber) }))
                }
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="ABCDE1234F"
              maxLength={10}
            />
            {formErrors.panNumber && (
              <div className="mt-1 text-xs text-red-600">{formErrors.panNumber}</div>
            )}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Name on PAN*</Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) => {
                const nameOnPan = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                setStep3({ ...step3, nameOnPan })
                if (formErrors.nameOnPan) {
                  setFormErrors((prev) => ({ ...prev, nameOnPan: getPanHolderNameError(nameOnPan) }))
                }
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Name as on PAN card"
            />
            {formErrors.nameOnPan && (
              <div className="mt-1 text-xs text-red-600">{formErrors.nameOnPan}</div>
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700">PAN image</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setStep3({ ...step3, panImage: e.target.files?.[0] || null })}
            className="mt-1 bg-white text-sm text-black placeholder-black"
          />
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">GST details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
          >
            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <div>
              <Input
                value={step3.gstNumber || ""}
                onChange={(e) => {
                  const gstNumber = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15)
                  setStep3({ ...step3, gstNumber })
                  if (formErrors.gstNumber) {
                    setFormErrors((prev) => ({
                      ...prev,
                      gstNumber: getGstNumberError(gstNumber, step3.gstRegistered),
                    }))
                  }
                }}
                className="bg-white text-sm"
                placeholder="GST number*"
                maxLength={15}
              />
              {formErrors.gstNumber && (
                <div className="mt-1 text-xs text-red-600">{formErrors.gstNumber}</div>
              )}
            </div>
            <div>
              <Input
                value={step3.gstLegalName || ""}
                onChange={(e) => {
                  const gstLegalName = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                  setStep3({ ...step3, gstLegalName })
                  if (formErrors.gstLegalName) {
                    setFormErrors((prev) => ({
                      ...prev,
                      gstLegalName: getGstLegalNameError(gstLegalName, step3.gstRegistered),
                    }))
                  }
                }}
                className="bg-white text-sm"
                placeholder="Legal name*"
              />
              {formErrors.gstLegalName && (
                <div className="mt-1 text-xs text-red-600">{formErrors.gstLegalName}</div>
              )}
            </div>
            <Input value={step3.gstAddress || ""} onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })} className="bg-white text-sm" placeholder="Registered address*" />
            <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, gstImage: e.target.files?.[0] || null })} className="bg-white text-sm" />
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input
              value={step3.fssaiNumber || ""}
              onChange={(e) => {
                const fssaiNumber = e.target.value.replace(/\D/g, "").slice(0, 14)
                setStep3({ ...step3, fssaiNumber })
                if (formErrors.fssaiNumber) {
                  setFormErrors((prev) => ({ ...prev, fssaiNumber: getFssaiNumberError(fssaiNumber) }))
                }
              }}
              className="bg-white text-sm"
              placeholder="FSSAI number"
              inputMode="numeric"
              maxLength={14}
            />
            {formErrors.fssaiNumber && (
              <div className="mt-1 text-xs text-red-600">{formErrors.fssaiNumber}</div>
            )}
          </div>
          <div>
            <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date</Label>
            <Input
              type="date"
              value={step3.fssaiExpiry || ""}
              min={todayDateString}
              onChange={(e) => {
                const fssaiExpiry = e.target.value
                setStep3({ ...step3, fssaiExpiry })
                if (formErrors.fssaiExpiry) {
                  setFormErrors((prev) => ({
                    ...prev,
                    fssaiExpiry: getFssaiExpiryError(fssaiExpiry, todayDateString),
                  }))
                }
              }}
              className="bg-white text-sm"
            />
            {formErrors.fssaiExpiry && (
              <div className="mt-1 text-xs text-red-600">{formErrors.fssaiExpiry}</div>
            )}
          </div>
        </div>
        <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, fssaiImage: e.target.files?.[0] || null })} className="bg-white text-sm" />
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Bank account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input value={step3.accountNumber || ""} onChange={(e) => setStep3({ ...step3, accountNumber: e.target.value.trim() })} className="bg-white text-sm" placeholder="Account number*" />
          <Input value={step3.confirmAccountNumber || ""} onChange={(e) => setStep3({ ...step3, confirmAccountNumber: e.target.value.trim() })} className="bg-white text-sm" placeholder="Re-enter account number*" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input
              value={step3.ifscCode || ""}
              onChange={(e) => {
                const ifscCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
                setStep3({ ...step3, ifscCode })
                if (formErrors.ifscCode) {
                  setFormErrors((prev) => ({ ...prev, ifscCode: getIfscCodeError(ifscCode) }))
                }
              }}
              className="bg-white text-sm"
              placeholder="IFSC code*"
              maxLength={11}
            />
            {formErrors.ifscCode && (
              <div className="mt-1 text-xs text-red-600">{formErrors.ifscCode}</div>
            )}
          </div>
          <Input value={step3.accountType || ""} onChange={(e) => setStep3({ ...step3, accountType: e.target.value })} className="bg-white text-sm" placeholder="Account type (savings / current)*" />
        </div>
        <div>
          <Input
            value={step3.accountHolderName || ""}
            onChange={(e) => {
              const accountHolderName = e.target.value.replace(/[^A-Za-z\s-]/g, "")
              setStep3({ ...step3, accountHolderName })
              if (formErrors.accountHolderName) {
                setFormErrors((prev) => ({
                  ...prev,
                  accountHolderName: getAccountHolderNameError(accountHolderName),
                }))
              }
            }}
            className="bg-white text-sm"
            placeholder="Account holder name*"
          />
          {formErrors.accountHolderName && (
            <div className="mt-1 text-xs text-red-600">{formErrors.accountHolderName}</div>
          )}
        </div>
      </section>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
        <div>
          <Label className="text-xs text-gray-700">Estimated Delivery Time*</Label>
          <Input value={step4.estimatedDeliveryTime || ""} onChange={(e) => setStep4({ ...step4, estimatedDeliveryTime: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 25-30 mins" />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Featured Dish Name*</Label>
          <Input value={step4.featuredDish || ""} onChange={(e) => setStep4({ ...step4, featuredDish: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., Butter Chicken Special" />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Featured Dish Price (₹)*</Label>
          <Input type="number" value={step4.featuredPrice || ""} onChange={(e) => setStep4({ ...step4, featuredPrice: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 249" min="0" />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Special Offer/Promotion*</Label>
          <Input value={step4.offer || ""} onChange={(e) => setStep4({ ...step4, offer: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., Flat ₹50 OFF above ₹199" />
        </div>
      </section>
    </div>
  )

  const renderStep5 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Authentication Details</h2>
        <p className="text-sm text-gray-600">Set up login credentials for the restaurant</p>
        <div>
          <Label className="text-xs text-gray-700">Email*</Label>
          <Input
            type="email"
            value={String(auth.email || "")}
            onChange={(e) => setAuth({ ...auth, email: e.target.value || "", signupMethod: e.target.value ? 'email' : 'phone' })}
            className="mt-1 bg-white text-sm"
            placeholder="restaurant@example.com"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Phone (if no email)</Label>
          <Input
            type="tel"
            value={String(auth.phone || "")}
            onChange={(e) => setAuth({ ...auth, phone: e.target.value || "", signupMethod: !auth.email ? 'phone' : 'email' })}
            className="mt-1 bg-white text-sm"
            placeholder="+91 9876543210"
          />
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    if (step === 4) return renderStep4()
    return renderStep5()
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-600" />
          <div className="text-sm font-semibold text-black">Add New Restaurant</div>
        </div>
        <div className="text-xs text-gray-600">Step {step} of 5</div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {renderStep()}
      </main>

      {formErrors.submit && (
        <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">{formErrors.submit}</div>
      )}

      <footer className="px-4 sm:px-6 py-3 bg-white">
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            disabled={isSubmitting}
            onClick={handleBack}
            className="text-sm text-gray-700 bg-transparent"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isSubmitting}
            className="text-sm bg-black text-white px-6"
          >
            {step === 5 ? (isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating... </> : "Create Restaurant") : isSubmitting ? "Saving..." : "Continue"}
          </Button>
        </div>
      </footer>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md bg-white p-0">
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-75"></div>
                <div className="relative bg-emerald-500 rounded-full p-4">
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-slate-900 mb-2">Restaurant Created Successfully!</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                The restaurant has been created and can now login with the provided credentials.
              </DialogDescription>
            </DialogHeader>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


