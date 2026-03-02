import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Edit2, ChevronRight, FileText, CheckCircle, XCircle, Eye, X, Upload, Camera } from "lucide-react"
import BottomPopup from "../components/BottomPopup"
import { toast } from "sonner"
import { deliveryAPI, uploadAPI } from "@/lib/api"

export default function ProfileDetails() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
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
    bankName: ""
  })
  const [bankDetailsErrors, setBankDetailsErrors] = useState({})
  const [isUpdatingBankDetails, setIsUpdatingBankDetails] = useState(false)
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const fileInputRef = useRef(null)

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
          // Set bank details
          setBankDetails({
            accountHolderName: profileData?.documents?.bankDetails?.accountHolderName || "",
            accountNumber: profileData?.documents?.bankDetails?.accountNumber || "",
            ifscCode: profileData?.documents?.bankDetails?.ifscCode || "",
            bankName: profileData?.documents?.bankDetails?.bankName || ""
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

    fetchProfile()
  }, [navigate])

  const getDocumentStatusLabel = (documentNode) => {
    if (!documentNode?.document) return "Not uploaded"

    const isDocVerified = documentNode?.verified === true
    const profileStatus = String(profile?.status || "").toLowerCase()
    const isProfileApproved = profileStatus === "approved" || profileStatus === "active"

    return isDocVerified || isProfileApproved ? "Verified" : "Not verified"
  }

  const profileImageUrl = profile?.profileImage?.url || profile?.documents?.photo || ""

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Profile</h1>
      </div>

      {/* Profile Picture Area */}
      <div className="relative w-full bg-gray-200 overflow-hidden flex items-center justify-center">
        {loading ? (
          <div className="w-full h-72 bg-gray-200" />
        ) : profileImageUrl ? (
          <img
            src={profileImageUrl}
            alt="Profile"
            className="w-full h-auto max-h-96 object-contain"
          />
        ) : (
          <div className="w-full h-72 bg-gray-200" />
        )}
        {imagePreview || profile?.profileImage?.url || profile?.documents?.photo ? (
          <div className="relative w-full group">
            <img
              src={imagePreview || profile?.profileImage?.url || profile?.documents?.photo}
              alt="Profile"
              className="w-full h-auto max-h-96 object-contain"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingProfilePhoto}
                className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {isUploadingProfilePhoto ? "Uploading..." : "Change Photo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full py-16 flex flex-col items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gray-300 flex items-center justify-center mb-4">
              <Camera className="w-12 h-12 text-gray-500" />
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingProfilePhoto}
              className="bg-[#00B761] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#00A055] transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {isUploadingProfilePhoto ? "Uploading..." : "Upload Profile Photo"}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return

            // Validate file type
            const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
            if (!allowedTypes.includes(file.type)) {
              toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
              return
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024 // 5MB
            if (file.size > maxSize) {
              toast.error("File size exceeds 5MB limit.")
              return
            }

            // Create preview
            const reader = new FileReader()
            reader.onloadend = () => {
              setImagePreview(reader.result)
            }
            reader.readAsDataURL(file)

            setIsUploadingProfilePhoto(true)
            try {
              // Upload image
              const uploadResponse = await uploadAPI.uploadMedia(file, {
                folder: 'delivery-profiles'
              })
              
              const imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url
              const publicId = uploadResponse?.data?.data?.publicId || uploadResponse?.data?.publicId
              
              if (!imageUrl) {
                throw new Error("Failed to get uploaded image URL")
              }

              // Update profile with uploaded image
              await deliveryAPI.updateProfile({
                profileImage: {
                  url: imageUrl,
                  publicId: publicId || null
                }
              })

              toast.success("Profile photo updated successfully")
              
              // Refetch profile
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
                <p className="text-sm text-gray-900">Zone</p>
                <p className="text-base text-gray-900">
                  {profile?.availability?.zones?.length > 0 ? "Assigned" : "Not assigned"}
                </p>
              </div>
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
            </div>

            {/* PAN Card */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">PAN Card</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatusLabel(profile?.documents?.pan)}
                </p>
              </div>
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
            </div>

            {/* Driving License */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-medium text-gray-900">Driving License</p>
                <p className="text-xs text-gray-500 mt-1">
                  {getDocumentStatusLabel(profile?.documents?.drivingLicense)}
                </p>
              </div>
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
              <div className="w-full align-center flex content-center justify-between">
                <p className="text-sm text-gray-900 mb-1">Email</p>
                <p className="text-base text-gray-900">{profile?.email || "-"}</p>
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
                  ₹{profile?.wallet?.balance?.toFixed(2) || "0.00"}
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
                  bankName: profile?.documents?.bankDetails?.bankName || ""
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
      {showDocumentModal && selectedDocument && (
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
      )}

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
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.accountHolderName ? "border-red-500" : "border-gray-300"
              }`}
              pattern="[a-zA-Z\s'-]+"
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
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.accountNumber ? "border-red-500" : "border-gray-300"
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
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${
                bankDetailsErrors.ifscCode ? "border-red-500" : "border-gray-300"
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
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                bankDetailsErrors.bankName ? "border-red-500" : "border-gray-300"
              }`}
              pattern="[a-zA-Z\s'&-]+"
              title="Bank name can only contain letters, spaces, apostrophes, hyphens, and ampersands"
            />
            {bankDetailsErrors.bankName && (
              <p className="text-red-500 text-xs mt-1">{bankDetailsErrors.bankName}</p>
            )}
            {!bankDetailsErrors.bankName && bankDetails.bankName && (
              <p className="text-xs text-gray-500 mt-1">Only letters, spaces, apostrophes, hyphens, and ampersands are allowed</p>
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

              if (Object.keys(errors).length > 0) {
                setBankDetailsErrors(errors)
                toast.error("Please fill all required fields correctly")
                return
              }

              setIsUpdatingBankDetails(true)
              try {
                await deliveryAPI.updateProfile({
                  documents: {
                    ...profile?.documents,
                    bankDetails: {
                      accountHolderName: bankDetails.accountHolderName.trim(),
                      accountNumber: bankDetails.accountNumber.trim(),
                      ifscCode: bankDetails.ifscCode.trim(),
                      bankName: bankDetails.bankName.trim()
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
            className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${
              isUpdatingBankDetails
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#00B761] hover:bg-[#00A055]"
            }`}
          >
            {isUpdatingBankDetails ? "Updating..." : "Save Bank Details"}
          </button>
        </div>
      </BottomPopup>

    </div>
  )
}

