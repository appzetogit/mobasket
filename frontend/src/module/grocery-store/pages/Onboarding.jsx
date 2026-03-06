import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Image as ImageIcon, MapPin, Phone, Store, Upload, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { uploadAPI, groceryStoreAPI } from "@/lib/api"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

const createInitialForm = () => ({
  storeName: "",
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
    landmark: "",
    zipCode: "",
    formattedAddress: "",
  },
})

export default function GroceryStoreOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const isFreshStepOne = searchParams.get("step") === "1"
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState(createInitialForm)

  const [images, setImages] = useState({
    storeImage: null,
    additionalImages: [],
  })

  useEffect(() => {
    const fetchData = async () => {
      if (isFreshStepOne) {
        setForm(createInitialForm())
        setImages({
          storeImage: null,
          additionalImages: [],
        })
        try {
          localStorage.removeItem("grocery-store_onboarding")
        } catch (storageError) {
          console.error("Failed to clear grocery store onboarding cache:", storageError)
        }
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const res = await groceryStoreAPI.getOnboarding()
        const data = res?.data?.data?.onboarding
        const store = res?.data?.data?.store

        if (data?.step1 || store) {
          const source = data?.step1 || {}
          setForm({
            storeName: source.storeName || store?.name || "",
            ownerName: source.ownerName || store?.ownerName || "",
            ownerEmail: source.ownerEmail || store?.ownerEmail || "",
            ownerPhone: source.ownerPhone || store?.ownerPhone || store?.phone || "",
            primaryContactNumber:
              source.primaryContactNumber || store?.primaryContactNumber || store?.phone || "",
            location: {
              addressLine1: source.location?.addressLine1 || store?.location?.addressLine1 || "",
              addressLine2: source.location?.addressLine2 || store?.location?.addressLine2 || "",
              area: source.location?.area || store?.location?.area || "",
              city: source.location?.city || store?.location?.city || "",
              state: source.location?.state || store?.location?.state || "",
              landmark: source.location?.landmark || store?.location?.landmark || "",
              zipCode:
                source.location?.zipCode ||
                store?.location?.zipCode ||
                store?.location?.postalCode ||
                store?.location?.pincode ||
                "",
              formattedAddress:
                source.location?.formattedAddress ||
                store?.location?.formattedAddress ||
                "",
            },
          })
        }

        if (data?.storeImage || store?.profileImage) {
          setImages((prev) => ({ ...prev, storeImage: data?.storeImage || store?.profileImage }))
        }
        if (Array.isArray(data?.additionalImages) && data.additionalImages.length > 0) {
          setImages((prev) => ({ ...prev, additionalImages: data.additionalImages }))
        } else if (Array.isArray(store?.menuImages) && store.menuImages.length > 0) {
          setImages((prev) => ({ ...prev, additionalImages: store.menuImages }))
        }
      } catch (err) {
        console.error("Error fetching onboarding data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isFreshStepOne])

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  const handleStoreImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setSaving(true)
      const uploaded = await handleUpload(file, "mobasket/grocery-store/store")
      setImages((prev) => ({ ...prev, storeImage: uploaded }))
      toast.success("Store image uploaded successfully")
    } catch (err) {
      toast.error(err.message || "Failed to upload image")
    } finally {
      setSaving(false)
      e.target.value = ""
    }
  }

  const handleAdditionalImageChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    try {
      setSaving(true)
      const uploads = []
      for (const file of files) {
        uploads.push(await handleUpload(file, "mobasket/grocery-store/additional"))
      }
      setImages((prev) => ({
        ...prev,
        additionalImages: [...prev.additionalImages, ...uploads],
      }))
      toast.success(`${uploads.length} image(s) uploaded successfully`)
    } catch (err) {
      toast.error(err.message || "Failed to upload images")
    } finally {
      setSaving(false)
      e.target.value = ""
    }
  }

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleLocationChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [field]: value,
      },
    }))
  }

  const removeStoreImage = () => {
    setImages((prev) => ({ ...prev, storeImage: null }))
  }

  const removeAdditionalImage = (index) => {
    setImages((prev) => ({
      ...prev,
      additionalImages: prev.additionalImages.filter((_, i) => i !== index),
    }))
  }

  const validate = () => {
    if (!form.storeName.trim()) return "Store name is required"
    if (!form.ownerName.trim()) return "Owner name is required"
    if (!form.ownerEmail.trim()) return "Owner email is required"
    if (!form.ownerPhone.trim()) return "Owner phone is required"
    if (!form.primaryContactNumber.trim()) return "Primary contact number is required"
    if (!form.location.addressLine1.trim()) return "Address line 1 is required"
    if (!form.location.area.trim()) return "Area is required"
    if (!form.location.city.trim()) return "City is required"
    if (!form.location.state.trim()) return "State is required"
    if (!form.location.zipCode.trim()) return "ZIP / postal code is required"
    return ""
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }

    setError("")
    setSaving(true)

    try {
      const formattedAddress = [
        form.location.addressLine1,
        form.location.addressLine2,
        form.location.area,
        form.location.city,
        form.location.state,
        form.location.zipCode,
      ]
        .filter(Boolean)
        .join(", ")

      const payload = {
        step1: {
          storeName: form.storeName.trim(),
          ownerName: form.ownerName.trim(),
          ownerEmail: form.ownerEmail.trim(),
          ownerPhone: form.ownerPhone.trim(),
          primaryContactNumber: form.primaryContactNumber.trim(),
          location: {
            ...form.location,
            formattedAddress,
          },
        },
        storeImage: images.storeImage,
        additionalImages: images.additionalImages,
        completedSteps: 1,
      }

      const response = await groceryStoreAPI.updateOnboarding(payload)
      const responseStore = response?.data?.data?.store || {}
      const responseOnboarding = response?.data?.data?.onboarding || {}

      try {
        const cachedRaw = localStorage.getItem("grocery-store_user")
        const cachedStore = cachedRaw ? JSON.parse(cachedRaw) : {}

        localStorage.setItem(
          "grocery-store_user",
          JSON.stringify({
            ...cachedStore,
            ...responseStore,
            onboarding: {
              ...(cachedStore?.onboarding || {}),
              ...responseOnboarding,
              completedSteps: 1,
            },
          }),
        )
        localStorage.setItem(
          "grocery-store_onboarding",
          JSON.stringify({
            ...responseOnboarding,
            completedSteps: 1,
          }),
        )
        window.dispatchEvent(new Event("groceryStoreAuthChanged"))
      } catch (storageError) {
        console.error("Failed to update cached grocery store onboarding:", storageError)
      }

      toast.success("Onboarding completed successfully!")
      setTimeout(() => {
        navigate("/store", { replace: true })
      }, 800)
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
        <div className="text-sm font-semibold text-black">{companyName || "Grocery Store"} onboarding</div>
        <div className="text-xs text-gray-600">Step 1 of 1</div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : (
          <div className="space-y-6">
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store details</h2>
              <p className="text-xs text-gray-500">
                Add the basic details customers and admins need to identify your store correctly.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Store name</span>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.storeName} onChange={(e) => handleFieldChange("storeName", e.target.value)} className="pl-10" />
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Owner name</span>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.ownerName} onChange={(e) => handleFieldChange("ownerName", e.target.value)} className="pl-10" />
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Owner email</span>
                  <Input type="email" value={form.ownerEmail} onChange={(e) => handleFieldChange("ownerEmail", e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Owner phone</span>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.ownerPhone} onChange={(e) => handleFieldChange("ownerPhone", e.target.value)} className="pl-10" />
                  </div>
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Primary contact number</span>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.primaryContactNumber} onChange={(e) => handleFieldChange("primaryContactNumber", e.target.value)} className="pl-10" />
                  </div>
                </label>
              </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store address</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Address line 1</span>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.location.addressLine1} onChange={(e) => handleLocationChange("addressLine1", e.target.value)} className="pl-10" />
                  </div>
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Address line 2</span>
                  <Input value={form.location.addressLine2} onChange={(e) => handleLocationChange("addressLine2", e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Area</span>
                  <Input value={form.location.area} onChange={(e) => handleLocationChange("area", e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">City</span>
                  <Input value={form.location.city} onChange={(e) => handleLocationChange("city", e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">State</span>
                  <Input value={form.location.state} onChange={(e) => handleLocationChange("state", e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">ZIP / postal code</span>
                  <Input value={form.location.zipCode} onChange={(e) => handleLocationChange("zipCode", e.target.value)} />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Landmark</span>
                  <Input value={form.location.landmark} onChange={(e) => handleLocationChange("landmark", e.target.value)} />
                </label>
              </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store images</h2>
              <p className="text-xs text-gray-500">
                Upload your storefront image and any additional photos. These are optional but useful.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Store profile image</label>
                <div className="flex items-center gap-4">
                  {images.storeImage ? (
                    <div className="relative">
                      <img
                        src={images.storeImage.url || images.storeImage}
                        alt="Store"
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      <button onClick={removeStoreImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <label htmlFor="storeImageInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>{images.storeImage ? "Change" : "Upload"}</span>
                  </label>
                  <input id="storeImageInput" type="file" accept="image/*" className="hidden" onChange={handleStoreImageChange} disabled={saving} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Additional images</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {images.additionalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img src={img.url || img} alt={`Additional ${idx + 1}`} className="w-full h-full rounded-lg object-cover" />
                      <button onClick={() => removeAdditionalImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label htmlFor="additionalImagesInput" className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400">
                    <Upload className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">Add image</span>
                  </label>
                  <input id="additionalImagesInput" type="file" accept="image/*" multiple className="hidden" onChange={handleAdditionalImageChange} disabled={saving} />
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {error && <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">{error}</div>}

      <footer className="px-4 sm:px-6 py-3 bg-white">
        <div className="flex justify-end items-center">
          <Button onClick={handleSubmit} disabled={saving} className="text-sm bg-black text-white px-6">
            {saving ? "Saving..." : "Complete onboarding"}
          </Button>
        </div>
      </footer>
    </div>
  )
}
