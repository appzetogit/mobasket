import { useRef, useState } from "react"
import { Upload, Eye, EyeOff, Settings } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

export default function AddDeliveryman() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    deliverymanType: "",
    zone: "",
    vehicle: "",
    identityType: "Passport",
    identityNumber: "",
    age: "",
    birthdate: "",
    phone: "+91",
    password: "",
    confirmPassword: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [profileImageName, setProfileImageName] = useState("")
  const [identityImageName, setIdentityImageName] = useState("")
  const [drivingLicenseName, setDrivingLicenseName] = useState("")
  const profileImageInputRef = useRef(null)
  const identityImageInputRef = useRef(null)
  const drivingLicenseInputRef = useRef(null)

  const handleInputChange = (field, value) => {
    if (field === "firstName" || field === "lastName") {
      value = value.replace(/[^A-Za-z]/g, "")
    }
    if (field === "identityNumber") {
      value = value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20)
    }
    if (field === "age") {
      value = value.replace(/\D/g, "").slice(0, 2)
    }
    if (field === "phone") {
      const numeric = value.replace(/[^\d+]/g, "")
      value = numeric.startsWith("+91") ? numeric : `+91${numeric.replace(/^\+/, "")}`
    }
    setFormData(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const handleFileSelection = (field, file) => {
    if (!file) return
    if (field === "profile") setProfileImageName(file.name)
    if (field === "identity") setIdentityImageName(file.name)
    if (field === "driving") setDrivingLicenseName(file.name)
  }

  const validateForm = () => {
    const errors = {}
    if (!formData.firstName.trim()) errors.firstName = "First name is required"
    else if (!/^[A-Za-z]+$/.test(formData.firstName.trim())) errors.firstName = "Only alphabet characters are allowed"
    if (!formData.lastName.trim()) errors.lastName = "Last name is required"
    else if (!/^[A-Za-z]+$/.test(formData.lastName.trim())) errors.lastName = "Only alphabet characters are allowed"
    if (!formData.email.trim()) {
      errors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Invalid email format"
    }
    if (!formData.deliverymanType) errors.deliverymanType = "Deliveryman type is required"
    if (!formData.zone) errors.zone = "Zone is required"
    if (!formData.vehicle) errors.vehicle = "Vehicle is required"
    if (!formData.identityNumber.trim()) errors.identityNumber = "Identity number is required"
    else if (!/^[A-Z0-9-]{6,20}$/.test(formData.identityNumber.trim())) errors.identityNumber = "Use 6-20 chars (A-Z, 0-9, -)"
    if (!formData.age || formData.age.length !== 2) errors.age = "Enter exactly 2 digits"
    else if (parseInt(formData.age, 10) < 18) errors.age = "Age must be at least 18"
    if (!formData.birthdate) errors.birthdate = "Birthdate is required"
    if (!formData.phone || !/^\+91\d{10}$/.test(formData.phone)) errors.phone = "Valid phone number is required"
    if (!formData.password || formData.password.length < 8) errors.password = "Password must be at least 8 characters"
    if (formData.password !== formData.confirmPassword) errors.confirmPassword = "Passwords do not match"
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    
    setIsSubmitting(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsSubmitting(false)
    setShowSuccessDialog(true)
    handleReset()
  }

  const handleReset = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      deliverymanType: "",
      zone: "",
      vehicle: "",
      identityType: "Passport",
      identityNumber: "",
      age: "",
      birthdate: "",
      phone: "+91",
      password: "",
      confirmPassword: "",
    })
    setProfileImageName("")
    setIdentityImageName("")
    setDrivingLicenseName("")
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
          {/* Settings Icon */}
          <button
            type="button"
            onClick={() => setShowSettingsDialog(true)}
            className="absolute top-6 right-6 p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-600" />
          </button>

          <h1 className="text-2xl font-bold text-slate-900 mb-6">Add New Deliveryman</h1>

          <form onSubmit={handleSubmit}>
            {/* 1. General info */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">1. General info</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    placeholder="Ex: Jhone"
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      formErrors.firstName ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  {formErrors.firstName && <p className="text-xs text-red-500 mt-1">{formErrors.firstName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    placeholder="Ex: Joe"
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      formErrors.lastName ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  {formErrors.lastName && <p className="text-xs text-red-500 mt-1">{formErrors.lastName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="Ex: ex@example.com"
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      formErrors.email ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Deliveryman Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.deliverymanType}
                    onChange={(e) => handleInputChange("deliverymanType", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Delivery man type</option>
                    <option value="full-time">Full Time</option>
                    <option value="part-time">Part Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Zone <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.zone}
                    onChange={(e) => handleInputChange("zone", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Select Zone</option>
                    <option value="asia">Asia</option>
                    <option value="europe">Europe</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Image <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={profileImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileSelection("profile", e.target.files?.[0])}
                  />
                  <div
                    onClick={() => profileImageInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleFileSelection("profile", e.dataTransfer.files?.[0])
                    }}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-blue-600 mb-1">Click to upload Or drag and drop</p>
                    <p className="text-xs text-slate-500">JPG, JPEG, PNG, Gif Image size: Max 2 MB (1:1)</p>
                    {profileImageName && <p className="text-xs text-slate-700 mt-2">{profileImageName}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Identification Information */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">2. Identification Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Vehicle <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.vehicle}
                    onChange={(e) => handleInputChange("vehicle", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Select Vehicle</option>
                    <option value="car">Car</option>
                    <option value="motorcycle">Motorcycle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Identity Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.identityType}
                    onChange={(e) => handleInputChange("identityType", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="Passport">Passport</option>
                    <option value="Driving License">Driving License</option>
                    <option value="National ID">National ID</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Identity Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.identityNumber}
                    onChange={(e) => handleInputChange("identityNumber", e.target.value)}
                    placeholder="Ex: DH-23434-LS"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Identity Image
                  </label>
                  <input
                    ref={identityImageInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => handleFileSelection("identity", e.target.files?.[0])}
                  />
                  <div
                    onClick={() => identityImageInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleFileSelection("identity", e.dataTransfer.files?.[0])
                    }}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-blue-600 mb-1">Select a file or Drag & Drop here</p>
                    <p className="text-xs text-slate-500">Pdf, doc, jpg. File size: max 2 MB</p>
                    {identityImageName && <p className="text-xs text-slate-700 mt-2">{identityImageName}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Additional Data */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">3. Additional Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Enter your age <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.age}
                    onChange={(e) => handleInputChange("age", e.target.value)}
                    placeholder="Enter Age"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Enter your birthdate <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.birthdate}
                    onChange={(e) => handleInputChange("birthdate", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Driving license
                  </label>
                  <input
                    ref={drivingLicenseInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFileSelection("driving", e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => drivingLicenseInputRef.current?.click()}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    {drivingLicenseName || "Choose driving license file"}
                  </button>
                </div>
              </div>
            </div>

            {/* 4. Account info */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">4. Account info</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-2.5 border border-slate-300 rounded-l-lg bg-slate-50 text-sm">
                      +91
                    </div>
                    <input
                      type="tel"
                      value={formData.phone.replace("+91", "")}
                      onChange={(e) => handleInputChange("phone", "+91" + e.target.value)}
                      placeholder="Enter phone number"
                      className="flex-1 px-4 py-2.5 border border-slate-300 border-l-0 rounded-r-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                      placeholder="Ex: 8+ Character"
                      className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      placeholder="Ex: 8+ Character"
                      className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-green-600">Success!</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-700">
              Deliveryman added successfully!
            </p>
          </div>
          <DialogFooter className="px-6 pb-6">
            <button
              onClick={() => setShowSuccessDialog(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Form Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                handleReset()
                setShowSettingsDialog(false)
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
            >
              Reset Form
            </button>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowSettingsDialog(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
