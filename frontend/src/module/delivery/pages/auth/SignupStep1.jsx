import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"
import { clearDeliverySignupSession } from "@/lib/utils/auth"

const getCachedDeliveryUser = () => {
  try {
    const rawUser = localStorage.getItem("delivery_user")
    return rawUser ? JSON.parse(rawUser) : null
  } catch {
    return null
  }
}

export default function SignupStep1() {
  const navigate = useNavigate()

  const defaultFormData = {
    name: "",
    email: "",
    address: "",
    city: "",
    state: "",
    vehicleType: "bike",
    vehicleName: "",
    vehicleNumber: "",
    panNumber: "",
    aadharNumber: ""
  }

  const [formData, setFormData] = useState(defaultFormData)
  const [errors, setErrors] = useState({})
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showBackPopup, setShowBackPopup] = useState(false)
  const cachedUser = useMemo(() => getCachedDeliveryUser(), [])

  const handleBack = () => {
    setShowBackPopup(true)
  }

  const confirmBack = () => {
    clearDeliverySignupSession()
    navigate("/delivery/sign-in", { replace: true })
  }

  useEffect(() => {
    if (cachedUser?.status && cachedUser.status !== "onboarding") {
      navigate("/delivery", { replace: true })
      return
    }

    let isMounted = true

    const fetchProfile = async () => {
      try {
        const response = await deliveryAPI.getProfile()
        const user = response?.data?.data?.user || response?.data?.user || response?.data?.data?.profile || response?.data?.profile

        if (!isMounted) return

        if (user) {
          try {
            localStorage.setItem("delivery_user", JSON.stringify(user))
          } catch {
            // Ignore localStorage write failures here; route logic should still proceed.
          }

          if (user.status && user.status !== "onboarding") {
            navigate("/delivery", { replace: true })
            return
          }

          setFormData({
            name: user.name || "",
            email: user.email || "",
            address: user.location?.addressLine1 || "",
            city: user.location?.city || "",
            state: user.location?.state || "",
            vehicleType: user.vehicle?.type || "bike",
            vehicleName: user.vehicle?.model || user.vehicle?.brand || "",
            vehicleNumber: user.vehicle?.number || "",
            panNumber: user.documents?.pan?.number || "",
            aadharNumber: user.documents?.aadhar?.number || ""
          })
        }
      } catch (error) {
        if (!isMounted) return
        console.error("Error fetching delivery profile:", error)
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false)
        }
      }
    }

    fetchProfile()
    return () => {
      isMounted = false
    }
    // `navigate` is stable from react-router; keep an empty dependency list so
    // HMR does not swap this hook between [] and [navigate] on live edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target

    // Validation for Full Name - only letters and spaces
    if (name === "name") {
      const nameRegex = /^[a-zA-Z\s]*$/;
      if (value === "" || nameRegex.test(value)) {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }))
      }
      // Clear error when user starts typing
      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ""
        }))
      }
      return;
    }

    // Validation for City - only letters, no spaces
    if (name === "city") {
      const cityRegex = /^[a-zA-Z]*$/;
      if (value === "" || cityRegex.test(value)) {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }))
      }
      // Clear error when user starts typing
      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ""
        }))
      }
      return;
    }

    // Validation for State - only letters, no spaces
    if (name === "state") {
      const stateRegex = /^[a-zA-Z]*$/;
      if (value === "" || stateRegex.test(value)) {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }))
      }
      // Clear error when user starts typing
      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ""
        }))
      }
      return;
    }

    // Validation for Vehicle Number - format: XX##XX#### (e.g., MH12AB1234)
    if (name === "vehicleNumber") {
      // Remove spaces and convert to uppercase
      const cleanedValue = value.replace(/\s/g, "").toUpperCase();
      // Allow only alphanumeric, max 10 characters
      const vehicleRegex = /^[A-Z0-9]{0,10}$/;
      if (vehicleRegex.test(cleanedValue)) {
        setFormData(prev => ({
          ...prev,
          [name]: cleanedValue
        }))
      }
      // Clear error when user starts typing
      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ""
        }))
      }
      return;
    }

    // For other fields, update normally
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ""
      }))
    }
  }

  const validate = () => {
    const newErrors = {}

    // Validate Full Name - only letters and spaces
    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    } else if (!/^[a-zA-Z\s]+$/.test(formData.name.trim())) {
      newErrors.name = "Name should only contain letters and spaces"
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters"
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format"
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required"
    }

    // Validate City - only letters, no spaces
    if (!formData.city.trim()) {
      newErrors.city = "City is required"
    } else if (!/^[a-zA-Z]+$/.test(formData.city.trim())) {
      newErrors.city = "City should only contain letters (no spaces)"
    }

    // Validate State - only letters, no spaces
    if (!formData.state.trim()) {
      newErrors.state = "State is required"
    } else if (!/^[a-zA-Z]+$/.test(formData.state.trim())) {
      newErrors.state = "State should only contain letters (no spaces)"
    }

    // Validate Vehicle Name - mandatory
    if (!formData.vehicleName.trim()) {
      newErrors.vehicleName = "Vehicle name/model is required"
    }

    // Validate Vehicle Number - format: XX##XX#### (e.g., MH12AB1234)
    if (!formData.vehicleNumber.trim()) {
      newErrors.vehicleNumber = "Vehicle number is required"
    } else {
      const vehicleNumberRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;
      if (!vehicleNumberRegex.test(formData.vehicleNumber.trim().toUpperCase())) {
        newErrors.vehicleNumber = "Invalid vehicle number format (e.g., MH12AB1234)"
      }
    }

    if (!formData.panNumber.trim()) {
      newErrors.panNumber = "PAN number is required"
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber.toUpperCase())) {
      newErrors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)"
    }

    if (!formData.aadharNumber.trim()) {
      newErrors.aadharNumber = "Aadhar number is required"
    } else if (!/^\d{12}$/.test(formData.aadharNumber.replace(/\s/g, ""))) {
      newErrors.aadharNumber = "Aadhar number must be 12 digits"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) {
      toast.error("Please fill all required fields correctly")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await deliveryAPI.submitSignupDetails({
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        vehicleType: formData.vehicleType,
        vehicleName: formData.vehicleName.trim() || null,
        vehicleNumber: formData.vehicleNumber.trim(),
        panNumber: formData.panNumber.trim().toUpperCase(),
        aadharNumber: formData.aadharNumber.replace(/\s/g, "")
      })

      if (response?.data?.success) {
        toast.success("Details saved successfully")
        navigate("/delivery/signup/documents")
      }
    } catch (error) {
      console.error("Error submitting signup details:", error)
      const message = error?.response?.data?.message || "Failed to save details. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Complete Your Profile</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {isLoadingProfile ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-4"></div>
            <p className="text-gray-500">Loading your details...</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Basic Details</h2>
              <p className="text-sm text-gray-600">Please provide your information to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.name ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., RajeshKumar"
                  pattern="[a-zA-Z\s]+"
                  title="Name should only contain letters and spaces"
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                {!errors.name && formData.name && (
                  <p className="text-xs text-gray-500 mt-1">Only letters and spaces are allowed</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.email ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., rajesh@gmail.com"
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={3}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.address ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., 123 MG Road, Indore"
                />
                {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
              </div>

              {/* City and State */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.city ? "border-red-500" : "border-gray-300"
                      }`}
                    placeholder="E.g., Indore"
                    pattern="[a-zA-Z]+"
                    title="City should only contain letters (no spaces)"
                  />
                  {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                  {!errors.city && formData.city && (
                    <p className="text-xs text-gray-500 mt-1">Only letters are allowed (no spaces)</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.state ? "border-red-500" : "border-gray-300"
                      }`}
                    placeholder="E.g., MadhyaPradesh"
                    pattern="[a-zA-Z]+"
                    title="State should only contain letters (no spaces)"
                  />
                  {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
                  {!errors.state && formData.state && (
                    <p className="text-xs text-gray-500 mt-1">Only letters are allowed (no spaces)</p>
                  )}
                </div>
              </div>

              {/* Vehicle Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="vehicleType"
                  value={formData.vehicleType}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="bike">Bike</option>
                  <option value="scooter">Scooter</option>
                  <option value="bicycle">Bicycle</option>
                  <option value="car">Car</option>
                </select>
              </div>

              {/* Vehicle Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Name/Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="vehicleName"
                  value={formData.vehicleName}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.vehicleName ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., HondaActiva"
                />
                {errors.vehicleName && <p className="text-red-500 text-sm mt-1">{errors.vehicleName}</p>}
              </div>

              {/* Vehicle Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="vehicleNumber"
                  value={formData.vehicleNumber}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${errors.vehicleNumber ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., MH12AB1234"
                  maxLength={10}
                  pattern="[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}"
                  title="Vehicle number format: XX##XX#### (e.g., MH12AB1234)"
                />
                {errors.vehicleNumber && <p className="text-red-500 text-sm mt-1">{errors.vehicleNumber}</p>}
                {!errors.vehicleNumber && formData.vehicleNumber && (
                  <p className="text-xs text-gray-500 mt-1">Format: XX##XX#### (e.g., MH12AB1234)</p>
                )}
              </div>

              {/* PAN Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PAN Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleChange}
                  maxLength={10}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${errors.panNumber ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., ABCDE1234F"
                />
                {errors.panNumber && <p className="text-red-500 text-sm mt-1">{errors.panNumber}</p>}
              </div>

              {/* Aadhar Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aadhar Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="aadharNumber"
                  value={formData.aadharNumber}
                  onChange={handleChange}
                  maxLength={12}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.aadharNumber ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="E.g., 123456789012"
                />
                {errors.aadharNumber && <p className="text-red-500 text-sm mt-1">{errors.aadharNumber}</p>}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-[#00B761] hover:bg-[#00A055]"
                  }`}
              >
                {isSubmitting ? "Saving..." : "Continue"}
              </button>
            </form>
          </>
        )}
      </div>

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
                  className="w-full py-3.5 bg-[#00B761] text-white font-bold rounded-xl hover:bg-[#00A055] transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Continue Signup
                </button>
                <button
                  onClick={confirmBack}
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
  )
}

