import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import apiClient from "@/lib/api/axios"
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

export default function SignupStep2() {
  const navigate = useNavigate()
  const [uploadedDocs, setUploadedDocs] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [uploading, setUploading] = useState({
    profilePhoto: false,
    aadharPhoto: false,
    panPhoto: false,
    drivingLicensePhoto: false
  })
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState("")
  const [showBackPopup, setShowBackPopup] = useState(false)
  const [cachedUser] = useState(() => getCachedDeliveryUser())
  const normalizedDrivingLicenseNumber = drivingLicenseNumber.trim().toUpperCase()
  const isDrivingLicenseNumberValid = /^[A-Z0-9]{8,20}$/.test(normalizedDrivingLicenseNumber)

  const handleBack = () => {
    setShowBackPopup(true)
  }

  const confirmBack = () => {
    clearDeliverySignupSession()
    navigate("/delivery/sign-in", { replace: true })
  }

  useEffect(() => {
    if (cachedUser?.status && cachedUser.status !== "onboarding") {
      localStorage.removeItem("delivery_needsSignup")
      navigate("/delivery/pending-approval", { replace: true })
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
            localStorage.removeItem("delivery_needsSignup")
            navigate("/delivery/pending-approval", { replace: true })
            return
          }

          // Map stored documents to state
          const docs = user.documents || {}
          setUploadedDocs({
            profilePhoto: user.profileImage?.url ? { url: user.profileImage.url, publicId: user.profileImage.publicId } : null,
            aadharPhoto: docs.aadhar?.document ? { url: docs.aadhar.document } : null,
            panPhoto: docs.pan?.document ? { url: docs.pan.document } : null,
            drivingLicensePhoto: docs.drivingLicense?.document ? { url: docs.drivingLicense.document } : null
          })

          if (docs.drivingLicense?.number) {
            setDrivingLicenseNumber(docs.drivingLicense.number)
          }
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

  useEffect(() => {
    // Ensure this step always opens from the top.
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }

    scrollToTop()
    const rafId = requestAnimationFrame(scrollToTop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB")
      return
    }

    setUploading(prev => ({ ...prev, [docType]: true }))

    try {
      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'mobasket/delivery/documents')

      // Upload to Cloudinary via backend
      const response = await apiClient.post('/upload/media', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response?.data?.success && response?.data?.data) {
        const { url, publicId } = response.data.data

        setUploadedDocs(prev => ({
          ...prev,
          [docType]: { url, publicId }
        }))

        toast.success(`${docType.replace(/([A-Z])/g, ' $1').trim()} uploaded successfully`)
      }
    } catch (error) {
      console.error(`Error uploading ${docType}:`, error)
      const message =
        error?.response?.data?.message ||
        error?.message ||
        `Failed to upload ${docType.replace(/([A-Z])/g, ' $1').trim()}`
      toast.error(message)
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }))
    }
  }

  const convertFlutterResultToFile = (result, fallbackName) => {
    if (!result?.base64) return null
    let base64Data = String(result.base64)
    if (base64Data.includes(",")) {
      base64Data = base64Data.split(",")[1]
    }

    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const mimeType = result.mimeType || "image/jpeg"
    const blob = new Blob([byteArray], { type: mimeType })
    return new File([blob], result.fileName || fallbackName, { type: mimeType })
  }

  const pickImageFromSource = async (docType, source, fallbackInputId) => {
    if (uploading[docType]) return

    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const result = await window.flutter_inappwebview.callHandler("openCamera", {
          source,
          accept: "image/*",
          multiple: false,
          quality: 0.8,
        })

        if (result?.success && result?.base64) {
          const file = convertFlutterResultToFile(result, `${docType}-${Date.now()}.jpg`)
          if (file) {
            await handleFileSelect(docType, file)
            return
          }
        }

        if (result?.cancelled) {
          return
        }
      } catch {
        // Fall back to browser file picker.
      }
    }

    document.getElementById(fallbackInputId)?.click()
  }

  const handleRemove = (docType) => {
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Check if all required documents are uploaded
    if (!uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !drivingLicenseNumber) {
      toast.error("Please upload all required documents and enter license number")
      return
    }

    if (!isDrivingLicenseNumberValid) {
      toast.error("Driving license number must be 8-20 letters or digits")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await deliveryAPI.submitSignupDocuments({
        profilePhoto: uploadedDocs.profilePhoto,
        aadharPhoto: uploadedDocs.aadharPhoto,
        panPhoto: uploadedDocs.panPhoto,
        drivingLicensePhoto: uploadedDocs.drivingLicensePhoto,
        drivingLicenseNumber: normalizedDrivingLicenseNumber
      })

      if (response?.data?.success) {
        const updatedProfile =
          response?.data?.data?.profile ||
          response?.data?.profile ||
          null

        if (updatedProfile) {
          try {
            localStorage.setItem("delivery_user", JSON.stringify(updatedProfile))
          } catch (storageError) {
            console.warn("Failed to update local delivery profile cache:", storageError)
          }
        } else {
          // Fallback: mark local profile as pending so home can show verification state
          try {
            const rawUser = localStorage.getItem("delivery_user")
            const parsedUser = rawUser ? JSON.parse(rawUser) : {}
            localStorage.setItem("delivery_user", JSON.stringify({
              ...parsedUser,
              status: "pending"
            }))
          } catch {
            // Ignore storage fallback failures.
          }
        }

        localStorage.removeItem("delivery_needsSignup")

        toast.success("Signup completed successfully!")

        // Redirect to verification pending screen.
        setTimeout(() => {
          navigate("/delivery/pending-approval", { replace: true })
        }, 1000)
      }
    } catch (error) {
      console.error("Error submitting documents:", error)
      const message = error?.response?.data?.message || "Failed to submit documents. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const uploaded = uploadedDocs[docType]
    const isUploading = uploading[docType]
    const galleryInputId = `${docType}-gallery-input`
    const cameraInputId = `${docType}-camera-input`

    const handleSelect = (e) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        handleFileSelect(docType, selectedFile)
      }
      // Allow selecting the same file again.
      e.target.value = ""
    }

    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {uploaded ? (
          <div className="relative">
            <img
              src={uploaded.url}
              alt={label}
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => handleRemove(docType)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
              <Check className="w-4 h-4" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg transition-colors p-4 flex flex-col items-center justify-center">
            <div className="flex flex-col items-center justify-center">
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                  <p className="text-sm text-gray-500">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-1">Choose upload method</p>
                  <p className="text-xs text-gray-400 mb-4">PNG, JPG up to 5MB</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => pickImageFromSource(docType, "gallery", galleryInputId)}
                      disabled={isUploading}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Gallery
                    </button>
                    <button
                      type="button"
                      onClick={() => pickImageFromSource(docType, "camera", cameraInputId)}
                      disabled={isUploading}
                      className="px-3 py-2 text-sm font-medium rounded-lg bg-[#00B761] text-white hover:bg-[#00A055] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Camera
                    </button>
                  </div>
                </>
              )}
            </div>

            <input
              id={galleryInputId}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleSelect}
              disabled={isUploading}
            />
            <input
              id={cameraInputId}
              type="file"
              className="hidden"
              accept="image/*"
              capture="environment"
              onChange={handleSelect}
              disabled={isUploading}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {isLoadingProfile ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-4"></div>
            <p className="text-gray-500">Loading documents...</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
              <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
              <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo" required={true} />
              <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />

              {/* Driving License Number Input */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Driving License Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={drivingLicenseNumber}
                  onChange={(e) => {
                    const sanitizedValue = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
                    setDrivingLicenseNumber(sanitizedValue)
                  }}
                  placeholder="Enter Driving License Number"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#00B761] text-sm"
                  pattern="[A-Z0-9]{8,20}"
                  required
                />
                {drivingLicenseNumber && !isDrivingLicenseNumberValid && (
                  <p className="text-red-500 text-xs mt-1">Use 8-20 letters and numbers only</p>
                )}
              </div>

              <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo (Optional)" required={false} />

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !isDrivingLicenseNumberValid}
                className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !isDrivingLicenseNumberValid
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-[#00B761] hover:bg-[#00A055]"
                  }`}
              >
                {isSubmitting ? "Submitting..." : "Complete Signup"}
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



