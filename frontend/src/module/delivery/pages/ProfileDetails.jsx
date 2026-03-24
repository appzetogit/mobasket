import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { navigateBackWithinDelivery } from "@/module/delivery/utils/navigation"
import { ArrowLeft, Plus, Edit2, ChevronRight, FileText, CheckCircle, XCircle, Eye, X, Upload, Camera, Trash2 } from "lucide-react"
import BottomPopup from "../components/BottomPopup"
import { toast } from "sonner"
import { deliveryAPI, uploadAPI } from "@/lib/api"
import { fetchDeliveryWallet } from "../utils/deliveryWalletState"

export default function ProfileDetails() {
  const navigate = useNavigate()
  const handleBack = () => navigateBackWithinDelivery(navigate)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [walletBalance, setWalletBalance] = useState(0)
  const [vehicleNumber, setVehicleNumber] = useState("")
  const [showVehiclePopup, setShowVehiclePopup] = useState(false)
  const [vehicleInput, setVehicleInput] = useState("")
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showBankDetailsPopup, setShowBankDetailsPopup] = useState(false)
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    upiId: ""
  })
  const [bankDetailsErrors, setBankDetailsErrors] = useState({})
  const [isUpdatingBankDetails, setIsUpdatingBankDetails] = useState(false)
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false)
  const [isDeletingProfilePhoto, setIsDeletingProfilePhoto] = useState(false)
  const [isUploadingDocument, setIsUploadingDocument] = useState(null) // null or 'aadhar' | 'pan' | 'drivingLicense'
  const [imagePreview, setImagePreview] = useState(null)
  const [showEmailPopup, setShowEmailPopup] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const documentInputRef = useRef(null)

  // Note: All alternate phone related code has been removed

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profileData = response.data.data.profile
          setProfile(profileData)
          setVehicleNumber(profileData?.vehicle?.number || "")
          setVehicleInput(profileData?.vehicle?.number || "")
          setEmailInput(profileData?.email || "")
          // Set bank details
          setBankDetails({
            accountHolderName: profileData?.documents?.bankDetails?.accountHolderName || "",
            accountNumber: profileData?.documents?.bankDetails?.accountNumber || "",
            ifscCode: profileData?.documents?.bankDetails?.ifscCode || "",
            bankName: profileData?.documents?.bankDetails?.bankName || "",
            upiId: profileData?.documents?.bankDetails?.upiId || ""
          })
        }
      } catch (error) {
        console.error("Error fetching profile:", error)

        // More detailed error handling
        if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
          toast.error("Cannot connect to server. Please check if backend is running.")
        } else if (error.response?.status === 401) {
          toast.error("Session expired. Please login again.")
          // Optionally redirect to login
          setTimeout(() => {
            navigate("/delivery/sign-in", { replace: true })
          }, 2000)
        } else {
          toast.error(error?.response?.data?.message || "Failed to load profile data")
        }
      } finally {
        setLoading(false)
      }
    }

    const loadWallet = async () => {
      try {
        const walletData = await fetchDeliveryWallet()
        const pocketBalance = walletData?.pocketBalance !== undefined
          ? Number(walletData.pocketBalance) || 0
          : Number(walletData?.totalBalance) || 0
        setWalletBalance(pocketBalance)
      } catch (error) {
        console.error("Error fetching wallet balance:", error)
      }
    }

    fetchProfile()
    loadWallet()
  }, [navigate])

  const getDocumentStatusLabel = (documentNode) => {
    if (!documentNode?.document) return "Not uploaded"

    const profileStatus = String(profile?.status || "").toLowerCase()
    const isProfileApproved = profileStatus === "approved" || profileStatus === "active"

    if (isProfileApproved) {
      return "Verified"
    }

    return "Not verified"
  }

  const profileImageUrl = profile?.profileImage?.url || ""

  const handleProfileImageFile = async (file) => {
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)

    setIsUploadingProfilePhoto(true)
    try {
      const uploadResponse = await uploadAPI.uploadMedia(file, {
        folder: 'delivery-profiles'
      })

      const imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url
      const publicId = uploadResponse?.data?.data?.publicId || uploadResponse?.data?.publicId

      if (!imageUrl) {
        throw new Error("Failed to get uploaded image URL")
      }

      await deliveryAPI.updateProfile({
        profileImage: {
          url: imageUrl,
          publicId: publicId || null
        }
      })

      toast.success("Profile photo updated successfully")

      const response = await deliveryAPI.getProfile()
      if (response?.data?.success && response?.data?.data?.profile) {
        setProfile(response.data.data.profile)
      }

      setImagePreview(null)
    } catch (error) {
      console.error("Error uploading profile photo:", error)
      toast.error(error?.response?.data?.message || "Failed to upload profile photo")
      setImagePreview(null)
    } finally {
      setIsUploadingProfilePhoto(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = ""
      }
    }
  }

  const handleProfileImageUpdate = async (source = "camera") => {
    // If Flutter InAppWebView is available, use native camera/gallery handler
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const result = await window.flutter_inappwebview.callHandler("openCamera", {
          source: source,
          accept: "image/*",
          multiple: false,
          quality: 0.8,
        })

        if (result && result.success && result.base64) {
          let base64Data = result.base64
          if (base64Data.includes(",")) {
            base64Data = base64Data.split(",")[1]
          }

          try {
            const byteCharacters = atob(base64Data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const mimeType = result.mimeType || "image/jpeg"
            const blob = new Blob([byteArray], { type: mimeType })
            const file = new File([blob], result.fileName || `delivery-profile-${Date.now()}.jpg`, { type: mimeType })
            await handleProfileImageFile(file)
            return
          } catch (convertError) {
            console.error(`Error converting base64 ${source} image:`, convertError)
            toast.error(`Failed to process image from ${source}. Please try again.`)
          }
        }
        // If user cancelled or result invalid, just fall back to file input
      } catch (error) {
        console.error(`Error calling Flutter ${source} handler:`, error)
        // fall through to web file input
      }
    }

    // Web / fallback: open source-specific file picker
    if (source === "camera" && cameraInputRef.current) {
      cameraInputRef.current.click()
      return
    }

    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleEmailUpdate = async () => {
    if (!emailInput.trim()) {
      toast.error("Email is required")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailInput.trim())) {
      toast.error("Invalid email format")
      return
    }

    setIsUpdatingEmail(true)
    try {
      const response = await deliveryAPI.updateProfile({
        email: emailInput.trim()
      })

      if (response?.data?.success) {
        toast.success("Email update request sent for admin approval")
        setShowEmailPopup(false)
        // Refresh profile to show new status
        const profileRes = await deliveryAPI.getProfile()
        if (profileRes?.data?.success && profileRes?.data?.data?.profile) {
          setProfile(profileRes.data.data.profile)
        }
      }
    } catch (error) {
      console.error("Error updating email:", error)
      toast.error(error?.response?.data?.message || "Failed to update email")
    } finally {
      setIsUpdatingEmail(false)
    }
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
        <h1 className="text-lg font-medium">Profile</h1>
      </div>

      {/* Status Banner */}
      {!loading && String(profile?.status || "").toLowerCase() === 'pending' && (
        <div className="bg-blue-50 px-4 py-2 flex items-center gap-2 border-b border-blue-100">
          <FileText className="w-4 h-4 text-blue-600" />
          <p className="text-sm text-blue-700 font-medium">
            Your profile is under review by admin
          </p>
        </div>
      )}

      {/* Profile Picture Area */}
      <div className="bg-white px-4 py-6 flex flex-col items-center gap-3 border-b border-gray-100">
        {/* Circle Avatar */}
        <div className="relative">
          <div
            onClick={() => handleProfileImageUpdate("gallery")}
            className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-2 border-gray-300 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          >
            {loading ? (
              <div className="w-full h-full bg-gray-200 animate-pulse" />
            ) : imagePreview || profileImageUrl ? (
              <img src={imagePreview || profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              // Show first letter of name when no image
              <span className="text-3xl font-bold text-gray-500 select-none">{profile?.name?.charAt(0)?.toUpperCase() || "?"}</span>
            )}
          </div>

          {/* Camera button - always visible */}
          <button
            onClick={() => handleProfileImageUpdate("camera")}
            disabled={isUploadingProfilePhoto || isDeletingProfilePhoto}
            className="absolute bottom-0 right-0 bg-[#00B761] text-white rounded-full p-1.5 shadow-md hover:bg-[#00A055] transition-colors disabled:opacity-50"
            title="Open camera"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleProfileImageUpdate("gallery")}
            disabled={isUploadingProfilePhoto || isDeletingProfilePhoto}
            className="absolute bottom-0 right-9 bg-gray-700 text-white rounded-full p-1.5 shadow-md hover:bg-gray-800 transition-colors disabled:opacity-50"
            title="Choose from gallery"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>

          {/* Delete button - only when image exists */}
          {(imagePreview || profileImageUrl) && (
            <button
              onClick={async () => {
                if (!window.confirm("Are you sure you want to delete your profile photo?")) return
                setIsDeletingProfilePhoto(true)
                try {
                  await deliveryAPI.updateProfile({
                    profileImage: { url: null, publicId: null }
                  })
                  toast.success("Profile photo deleted")
                  setImagePreview(null)
                  const response = await deliveryAPI.getProfile()
                  if (response?.data?.success && response?.data?.data?.profile) {
                    setProfile(response.data.data.profile)
                  }
                } catch (error) {
                  console.error("Error deleting profile photo:", error)
                  toast.error(error?.response?.data?.message || "Failed to delete profile photo")
                } finally {
                  setIsDeletingProfilePhoto(false)
                }
              }}
              disabled={isDeletingProfilePhoto || isUploadingProfilePhoto}
              className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 transition-colors disabled:opacity-50"
              title="Delete photo"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Name */}
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">
            {loading ? "Loading..." : profile?.name || "Rider"}
          </p>
          {profile?.deliveryId && (
            <p className="text-xs text-gray-500 mt-0.5">{profile.deliveryId}</p>
          )}
        </div>

        {isUploadingProfilePhoto && (
          <p className="text-xs text-gray-500">Uploading photo...</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            await handleProfileImageFile(file)
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            await handleProfileImageFile(file)
          }}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file || !isUploadingDocument) return

            const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
            if (!allowedTypes.includes(file.type)) {
              toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
              return
            }

            const maxSize = 5 * 1024 * 1024
            if (file.size > maxSize) {
              toast.error("File size exceeds 5MB limit.")
              return
            }

            const docType = isUploadingDocument // 'aadhar', 'pan', or 'drivingLicense'

            try {
              toast.loading(`Uploading ${docType}...`, { id: 'doc-upload' })
              const uploadResponse = await uploadAPI.uploadMedia(file, {
                folder: `delivery-documents/${docType}`
              })

              const imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url
              const publicId = uploadResponse?.data?.data?.publicId || uploadResponse?.data?.publicId

              if (!imageUrl) {
                throw new Error("Failed to get uploaded image URL")
              }

              const updateResponse = await deliveryAPI.updateProfile({
                documents: {
                  [docType]: {
                    document: imageUrl
                  }
                }
              })

              if (updateResponse?.data?.success && updateResponse?.data?.data?.profile) {
                setProfile(updateResponse.data.data.profile)
                toast.success(`${docType.charAt(0).toUpperCase() + docType.slice(1)} updated successfully`, { id: 'doc-upload' })
              } else {
                // Fallback to getProfile if updateResponse doesn't have data
                const response = await deliveryAPI.getProfile()
                if (response?.data?.success && response?.data?.data?.profile) {
                  setProfile(response.data.data.profile)
                }
                toast.success(`${docType.charAt(0).toUpperCase() + docType.slice(1)} updated successfully`, { id: 'doc-upload' })
              }
            } catch (error) {
              console.error(`Error uploading ${docType}:`, error)
              toast.error(error?.response?.data?.message || `Failed to update ${docType}`, { id: 'doc-upload' })
            } finally {
              setIsUploadingDocument(null)
              if (documentInputRef.current) {
                documentInputRef.current.value = ""
              }
            }
          }}
        />
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Rider Details Section */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3">Rider details</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
              <p className="text-base text-gray-900">
                {loading ? "Loading..." : `${profile?.name || "N/A"} (${profile?.deliveryId || "N/A"})`}
              </p>
            </div>
            <div className="divide-y divide-gray-200">

              <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">City</p>
                <p className="text-base text-gray-900">
                  {profile?.location?.city || "N/A"}
                </p>
              </div>
              <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">Vehicle type</p>
                <p className="text-base text-gray-900 capitalize">
                  {profile?.vehicle?.type || "N/A"}
                </p>
              </div>
              <div className="p-2 px-3 flex items-center justify-between">
                <p className="text-sm text-gray-900">Vehicle number</p>
                {vehicleNumber ? (
                  <div className="flex items-center gap-2">
                    <p className="text-base text-gray-900">{vehicleNumber}</p>
                    <button
                      onClick={() => {
                        setVehicleInput(vehicleNumber)
                        setShowVehiclePopup(true)
                      }}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-green-600" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setVehicleInput("")
                      setShowVehiclePopup(true)
                    }}
                    className="flex items-center gap-2 text-green-600 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Documents Section */}
        <div>
          <h2 className="text-base font-medium text-gray-900 mb-3">Documents</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            {/* Aadhar Card */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">Aadhar Card</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatusLabel(profile?.documents?.aadhar)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {profile?.documents?.aadhar?.document && (
                  <button
                    onClick={() => {
                      setSelectedDocument({
                        name: "Aadhar Card",
                        url: profile.documents.aadhar.document
                      })
                      setShowDocumentModal(true)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Eye className="w-5 h-5 text-gray-600" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsUploadingDocument('aadhar')
                    documentInputRef.current?.click()
                  }}
                  disabled={!!isUploadingDocument}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                  title="Update Aadhar"
                >
                  <Edit2 className="w-4 h-4 text-green-600" />
                </button>
              </div>
            </div>

            {/* PAN Card */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">PAN Card</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatusLabel(profile?.documents?.pan)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {profile?.documents?.pan?.document && (
                  <button
                    onClick={() => {
                      setSelectedDocument({
                        name: "PAN Card",
                        url: profile.documents.pan.document
                      })
                      setShowDocumentModal(true)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Eye className="w-5 h-5 text-gray-600" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsUploadingDocument('pan')
                    documentInputRef.current?.click()
                  }}
                  disabled={!!isUploadingDocument}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                  title="Update PAN"
                >
                  <Edit2 className="w-4 h-4 text-green-600" />
                </button>
              </div>
            </div>

            {/* Driving License */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">Driving License</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatusLabel(profile?.documents?.drivingLicense)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {profile?.documents?.drivingLicense?.document && (
                  <button
                    onClick={() => {
                      setSelectedDocument({
                        name: "Driving License",
                        url: profile.documents.drivingLicense.document
                      })
                      setShowDocumentModal(true)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Eye className="w-5 h-5 text-gray-600" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsUploadingDocument('drivingLicense')
                    documentInputRef.current?.click()
                  }}
                  disabled={!!isUploadingDocument}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                  title="Update Driving License"
                >
                  <Edit2 className="w-4 h-4 text-green-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Details Section */}
        <div>
          <h2 className="text-base font-medium text-gray-900 mb-3">Personal details</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Phone</p>
                <p className="text-base text-gray-900">
                  {profile?.phone || "N/A"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full flex items-center justify-between">
                <p className="text-sm text-gray-900">Email</p>
                <div className="flex items-center gap-2">
                  <p className="text-base text-gray-900">{profile?.email || "-"}</p>
                  <button
                    onClick={() => {
                      setEmailInput(profile?.email || "")
                      setShowEmailPopup(true)
                    }}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-green-600" />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Aadhar Card Number</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.aadhar?.number || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Rating</p>
                <p className="text-base text-gray-900">
                  {profile?.metrics?.rating ? `${profile.metrics.rating.toFixed(1)} (${profile.metrics.ratingCount || 0})` : "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Wallet Balance</p>
                <p className="text-base text-gray-900">
                  ₹{walletBalance.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Status</p>
                <p className="text-base text-gray-900 capitalize">
                  {profile?.status || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Bank details</h2>
            <button
              onClick={() => {
                setShowBankDetailsPopup(true)
                // Pre-fill form with existing data
                setBankDetails({
                  accountHolderName: profile?.documents?.bankDetails?.accountHolderName || "",
                  accountNumber: profile?.documents?.bankDetails?.accountNumber || "",
                  ifscCode: profile?.documents?.bankDetails?.ifscCode || "",
                  bankName: profile?.documents?.bankDetails?.bankName || "",
                  upiId: profile?.documents?.bankDetails?.upiId || ""
                })
                setBankDetailsErrors({})
              }}
              className="text-green-600 font-medium text-sm flex items-center gap-1 hover:text-green-700"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Account Holder Name</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.accountHolderName || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Account Number</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.accountNumber
                    ? `****${profile.documents.bankDetails.accountNumber.slice(-4)}`
                    : "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">IFSC Code</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.ifscCode || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Bank Name</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.bankName || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">UPI ID (Optional)</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.bankDetails?.upiId || "-"}
                </p>
              </div>
            </div>
            <div className="p-2 px-3 flex items-center justify-between">
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Pan Card Number</p>
                <p className="text-base text-gray-900">
                  {profile?.documents?.pan?.number || "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle Number Popup */}
      <BottomPopup
        isOpen={showVehiclePopup}
        onClose={() => setShowVehiclePopup(false)}
        title={vehicleNumber ? "Edit Vehicle Number" : "Add Vehicle Number"}
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="50vh"
      >
        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={vehicleInput}
              onChange={(e) => setVehicleInput(e.target.value)}
              placeholder="Enter vehicle number"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <button
            onClick={async () => {
              if (vehicleInput.trim()) {
                try {
                  await deliveryAPI.updateProfile({
                    vehicle: {
                      ...profile?.vehicle,
                      number: vehicleInput.trim()
                    }
                  })
                  setVehicleNumber(vehicleInput.trim())
                  setShowVehiclePopup(false)
                  toast.success("Vehicle number updated successfully")
                  // Refetch profile
                  const response = await deliveryAPI.getProfile()
                  if (response?.data?.success && response?.data?.data?.profile) {
                    setProfile(response.data.data.profile)
                  }
                } catch (error) {
                  console.error("Error updating vehicle number:", error)
                  toast.error("Failed to update vehicle number")
                }
              } else {
                toast.error("Please enter a valid vehicle number")
              }
            }}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            {vehicleNumber ? "Update" : "Add"}
          </button>
        </div>
      </BottomPopup>

      {/* Document Image Modal */}
      {
        showDocumentModal && selectedDocument && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto relative">
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowDocumentModal(false)
                  setSelectedDocument(null)
                }}
                className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              {/* Document Title */}
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{selectedDocument.name}</h3>
              </div>

              {/* Document Image */}
              <div className="p-4">
                <img
                  src={selectedDocument.url}
                  alt={selectedDocument.name}
                  className="w-full h-auto rounded-lg"
                />
              </div>
            </div>
          </div>
        )
      }

      {/* Bank Details Edit Popup */}
      <BottomPopup
        isOpen={showBankDetailsPopup}
        onClose={() => {
          setShowBankDetailsPopup(false)
          setBankDetailsErrors({})
        }}
        title="Edit Bank Details"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="80vh"
      >
        <div className="space-y-4">
          {/* Account Holder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Holder Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.accountHolderName}
              onChange={(e) => {
                // Only allow letters, spaces, apostrophes, and hyphens
                const nameRegex = /^[a-zA-Z\s'-]*$/
                const value = e.target.value
                if (value === "" || nameRegex.test(value)) {
                  setBankDetails(prev => ({ ...prev, accountHolderName: value }))
                  setBankDetailsErrors(prev => ({ ...prev, accountHolderName: "" }))
                }
              }}
              placeholder="Enter account holder name"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${bankDetailsErrors.accountHolderName ? "border-red-500" : "border-gray-300"
                }`}
              pattern="[-A-Za-z ']+"
              title="Account holder name can only contain letters, spaces, apostrophes, and hyphens"
            />
            {bankDetailsErrors.accountHolderName && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.accountHolderName}</p>
            )}
            {!bankDetailsErrors.accountHolderName && bankDetails.accountHolderName && (
              <p className="text-xs text-gray-500 mt-1">Only letters, spaces, apostrophes, and hyphens are allowed</p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.accountNumber}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, '')
                // Limit to 18 digits
                const limitedValue = value.slice(0, 18)
                setBankDetails(prev => ({ ...prev, accountNumber: limitedValue }))
                setBankDetailsErrors(prev => ({ ...prev, accountNumber: "" }))
              }}
              placeholder="Enter account number (9-18 digits)"
              maxLength={18}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${bankDetailsErrors.accountNumber ? "border-red-500" : "border-gray-300"
                }`}
              pattern="[0-9]{9,18}"
              title="Account number must be between 9 and 18 digits"
            />
            {bankDetailsErrors.accountNumber && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.accountNumber}</p>
            )}
            {!bankDetailsErrors.accountNumber && bankDetails.accountNumber && (
              <p className="text-xs text-gray-500 mt-1">
                {bankDetails.accountNumber.length < 9 && "Account number must be at least 9 digits"}
                {bankDetails.accountNumber.length >= 9 && bankDetails.accountNumber.length <= 18 && "Valid account number"}
              </p>
            )}
          </div>

          {/* IFSC Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IFSC Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.ifscCode}
              onChange={(e) => {
                // IFSC format: AAAA0####0 (4 letters, 1 zero, 4 alphanumeric, 1 alphanumeric)
                // Only allow uppercase letters and numbers, no special characters
                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                // Limit to 11 characters
                const limitedValue = value.slice(0, 11)
                setBankDetails(prev => ({ ...prev, ifscCode: limitedValue }))
                setBankDetailsErrors(prev => ({ ...prev, ifscCode: "" }))
              }}
              placeholder="Enter IFSC code (e.g., HDFC0001234)"
              maxLength={11}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${bankDetailsErrors.ifscCode ? "border-red-500" : "border-gray-300"
                }`}
              pattern="[A-Z]{4}0[A-Z0-9]{6}"
              title="IFSC code format: AAAA0####0 (4 letters, 1 zero, 6 alphanumeric)"
            />
            {bankDetailsErrors.ifscCode && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.ifscCode}</p>
            )}
            {!bankDetailsErrors.ifscCode && bankDetails.ifscCode && (
              <p className="text-xs text-gray-500 mt-1">
                Format: AAAA0####0 (e.g., HDFC0001234)
                {bankDetails.ifscCode.length !== 11 && ` - ${11 - bankDetails.ifscCode.length} characters remaining`}
              </p>
            )}
          </div>

          {/* Bank Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankDetails.bankName}
              onChange={(e) => {
                // Only allow letters, spaces, apostrophes, hyphens, and common bank name characters
                const bankNameRegex = /^[a-zA-Z\s'&-]*$/
                const value = e.target.value
                if (value === "" || bankNameRegex.test(value)) {
                  setBankDetails(prev => ({ ...prev, bankName: value }))
                  setBankDetailsErrors(prev => ({ ...prev, bankName: "" }))
                }
              }}
              placeholder="Enter bank name"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${bankDetailsErrors.bankName ? "border-red-500" : "border-gray-300"
                }`}
              pattern="[-A-Za-z '&]+"
              title="Bank name can only contain letters, spaces, apostrophes, hyphens, and ampersands"
            />
            {bankDetailsErrors.bankName && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.bankName}</p>
            )}
            {!bankDetailsErrors.bankName && bankDetails.bankName && (
              <p className="text-xs text-gray-500 mt-1">Only letters, spaces, apostrophes, hyphens, and ampersands are allowed</p>
            )}
          </div>

          {/* UPI ID (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              UPI ID <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              type="text"
              value={bankDetails.upiId}
              onChange={(e) => {
                const value = e.target.value.trim()
                setBankDetails(prev => ({ ...prev, upiId: value }))
                setBankDetailsErrors(prev => ({ ...prev, upiId: "" }))
              }}
              placeholder="Enter UPI ID (e.g., yourname@bank)"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${bankDetailsErrors.upiId ? "border-red-500" : "border-gray-300"
                }`}
            />
            {bankDetailsErrors.upiId && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.upiId}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={async () => {
              // Validate
              const errors = {}

              // Account Holder Name validation
              if (!bankDetails.accountHolderName.trim()) {
                errors.accountHolderName = "Account holder name is required"
              } else {
                const nameRegex = /^[a-zA-Z\s'-]+$/
                if (!nameRegex.test(bankDetails.accountHolderName.trim())) {
                  errors.accountHolderName = "Account holder name can only contain letters, spaces, apostrophes, and hyphens"
                } else if (bankDetails.accountHolderName.trim().length < 2) {
                  errors.accountHolderName = "Account holder name must be at least 2 characters"
                }
              }

              // Account Number validation
              if (!bankDetails.accountNumber.trim()) {
                errors.accountNumber = "Account number is required"
              } else {
                const accountNumberRegex = /^[0-9]{9,18}$/
                if (!accountNumberRegex.test(bankDetails.accountNumber)) {
                  errors.accountNumber = "Account number must be between 9 and 18 digits"
                }
              }

              // IFSC Code validation
              if (!bankDetails.ifscCode.trim()) {
                errors.ifscCode = "IFSC code is required"
              } else {
                const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
                if (!ifscRegex.test(bankDetails.ifscCode)) {
                  errors.ifscCode = "Invalid IFSC code format. Format: AAAA0####0 (e.g., HDFC0001234)"
                }
              }

              // Bank Name validation
              if (!bankDetails.bankName.trim()) {
                errors.bankName = "Bank name is required"
              } else {
                const bankNameRegex = /^[a-zA-Z\s'&-]+$/
                if (!bankNameRegex.test(bankDetails.bankName.trim())) {
                  errors.bankName = "Bank name can only contain letters, spaces, apostrophes, hyphens, and ampersands"
                } else if (bankDetails.bankName.trim().length < 2) {
                  errors.bankName = "Bank name must be at least 2 characters"
                }
              }

              // UPI ID validation (optional)
              if (bankDetails.upiId && bankDetails.upiId.trim()) {
                const upiRegex = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/
                if (!upiRegex.test(bankDetails.upiId.trim())) {
                  errors.upiId = "Invalid UPI ID format (example: name@bank)"
                }
              }

              if (Object.keys(errors).length > 0) {
                setBankDetailsErrors(errors)
                toast.error("Please fill all required fields correctly")
                return
              }

              setIsUpdatingBankDetails(true)
              try {
                await deliveryAPI.updateProfile({
                  documents: {
                    bankDetails: {
                      accountHolderName: bankDetails.accountHolderName.trim(),
                      accountNumber: bankDetails.accountNumber.trim(),
                      ifscCode: bankDetails.ifscCode.trim(),
                      bankName: bankDetails.bankName.trim(),
                      upiId: bankDetails.upiId?.trim() || ""
                    }
                  }
                })
                toast.success("Bank details updated successfully")
                setShowBankDetailsPopup(false)
                // Refetch profile
                const response = await deliveryAPI.getProfile()
                if (response?.data?.success && response?.data?.data?.profile) {
                  setProfile(response.data.data.profile)
                }
              } catch (error) {
                console.error("Error updating bank details:", error)
                toast.error(error?.response?.data?.message || "Failed to update bank details")
              } finally {
                setIsUpdatingBankDetails(false)
              }
            }}
            disabled={isUpdatingBankDetails}
            className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${isUpdatingBankDetails
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isUpdatingBankDetails ? "Updating..." : "Save Bank Details"}
          </button>
        </div>
      </BottomPopup>
      {/* Email Edit Popup */}
      <BottomPopup
        isOpen={showEmailPopup}
        onClose={() => !isUpdatingEmail && setShowEmailPopup(false)}
        title="Edit Email Address"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Email Address
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none"
              placeholder="Enter your email"
              disabled={isUpdatingEmail}
            />
          </div>
          <div className="bg-blue-50 p-3 rounded-lg flex gap-2">
            <div className="shrink-0 mt-0.5">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">
              Note: Changing your email will require admin approval. Your profile status will be set to pending until verified.
            </p>
          </div>
          <button
            onClick={handleEmailUpdate}
            disabled={isUpdatingEmail}
            className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${isUpdatingEmail
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isUpdatingEmail ? "Updating..." : "Update Email"}
          </button>
        </div>
      </BottomPopup>

    </div >
  )
}

