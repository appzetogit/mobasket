import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function PolicyModal({
  open,
  onOpenChange,
  title,
  loading = false,
  content = "",
  fallbackUrl = "",
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
          <DialogTitle className="text-xl font-bold text-slate-900">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600">Loading...</p>
            </div>
          ) : content ? (
            <div
              className="prose max-w-none text-slate-700"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : fallbackUrl ? (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-blue-600 underline"
            >
              Open document
            </a>
          ) : (
            <p className="text-sm text-slate-600">Content is not available right now.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
