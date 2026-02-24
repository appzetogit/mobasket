import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Image as ImageIcon, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadAPI, groceryStoreAPI } from "@/lib/api"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function GroceryStoreOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [images, setImages] = useState({
    storeImage: null,
    additionalImages: [],
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await groceryStoreAPI.getOnboarding()
        const data = res?.data?.data?.onboarding
        if (data) {
          if (data.storeImage) {
            setImages((prev) => ({ ...prev, storeImage: data.storeImage }))
          }
          if (data.additionalImages && Array.isArray(data.additionalImages)) {
            setImages((prev) => ({ ...prev, additionalImages: data.additionalImages }))
          }
        }
      } catch (err) {
        console.error("Error fetching onboarding data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

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

  const handleStoreImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setSaving(true)
      const uploaded = await handleUpload(file, "appzeto/grocery-store/store")
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
        const uploaded = await handleUpload(file, "appzeto/grocery-store/additional")
        uploads.push(uploaded)
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

  const removeStoreImage = () => {
    setImages((prev) => ({ ...prev, storeImage: null }))
  }

  const removeAdditionalImage = (index) => {
    setImages((prev) => ({
      ...prev,
      additionalImages: prev.additionalImages.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = async () => {
    setError("")
    setSaving(true)

    try {
      const payload = {
        storeImage: images.storeImage,
        additionalImages: images.additionalImages,
        completedSteps: 1,
      }

      await groceryStoreAPI.updateOnboarding(payload)
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
        <div className="text-sm font-semibold text-black">Grocery Store Onboarding</div>
        <div className="text-xs text-gray-600">Step 1 of 1</div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : (
          <div className="space-y-6">
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store Images (Optional)</h2>
              <p className="text-xs text-gray-500">
                Upload images of your grocery store. These are optional but help customers see your store.
              </p>

              {/* Store Image */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Store Profile Image</label>
                <div className="flex items-center gap-4">
                  {images.storeImage ? (
                    <div className="relative">
                      <img
                        src={images.storeImage.url || images.storeImage}
                        alt="Store"
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      <button
                        onClick={removeStoreImage}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <label
                    htmlFor="storeImageInput"
                    className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{images.storeImage ? "Change" : "Upload"}</span>
                  </label>
                  <input
                    id="storeImageInput"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleStoreImageChange}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Additional Images */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Additional Images (Optional)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {images.additionalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img
                        src={img.url || img}
                        alt={`Additional ${idx + 1}`}
                        className="w-full h-full rounded-lg object-cover"
                      />
                      <button
                        onClick={() => removeAdditionalImage(idx)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label
                    htmlFor="additionalImagesInput"
                    className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400"
                  >
                    <Upload className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">Add Image</span>
                  </label>
                  <input
                    id="additionalImagesInput"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAdditionalImageChange}
                    disabled={saving}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {error && (
        <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <footer className="px-4 sm:px-6 py-3 bg-white">
        <div className="flex justify-end items-center">
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="text-sm bg-black text-white px-6"
          >
            {saving ? "Saving..." : "Complete Onboarding"}
          </Button>
        </div>
      </footer>
    </div>
  )
}
