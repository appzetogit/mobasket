import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

export default function Settings() {
  const [emailNotifications, setEmailNotifications] = useState(() => {
    const saved = localStorage.getItem("user_setting_email_notifications")
    return saved === null ? true : saved === "true"
  })
  const [pushNotifications, setPushNotifications] = useState(() => {
    const saved = localStorage.getItem("user_setting_push_notifications")
    return saved === null ? true : saved === "true"
  })

  useEffect(() => {
    localStorage.setItem("user_setting_email_notifications", String(emailNotifications))
  }, [emailNotifications])

  useEffect(() => {
    localStorage.setItem("user_setting_push_notifications", String(pushNotifications))
  }, [pushNotifications])

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4">
      <div className="max-w-[1100px] mx-auto space-y-6 md:pt-20 lg:pt-24 md:pb-6 lg:pb-8">
        <div className="flex items-center gap-3">
          <div className="cursor-pointer inline-block" onClick={() => { if (window.history.length > 1) { window.history.back(); } else { window.location.href = '/user/profile'; } }}>
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-black dark:text-white">Settings</h1>
        </div>
        <Card className="bg-white dark:bg-[#1a1a1a] border-0 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Notifications & Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive updates about your orders via email
                </p>
              </div>
              <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications on your device
                </p>
              </div>
              <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
            </div>
          </CardContent>
        </Card>
      </div>
    </AnimatedPage>
  )
}

