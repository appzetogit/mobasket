import { useState, useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import AdminSidebar from "./AdminSidebar"
import AdminNavbar from "./AdminNavbar"
import { PlatformProvider, usePlatform } from "../context/PlatformContext"

function AdminLayoutContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { platform } = usePlatform();
  const location = useLocation();

  // Get initial collapsed state from localStorage to set initial margin
  useEffect(() => {
    try {
      const saved = localStorage.getItem('adminSidebarCollapsed')
      if (saved !== null) {
        setIsSidebarCollapsed(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Error loading sidebar collapsed state:', e)
    }
  }, [])

  const handleCollapseChange = (collapsed) => {
    setIsSidebarCollapsed(collapsed)
  }

  return (
    <div className="min-h-screen bg-neutral-200 flex">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AdminSidebar
        key={`sidebar:${platform}`}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapseChange={handleCollapseChange}
      />

      {/* Main Content Area */}
      <div className={`
        flex-1 flex flex-col transition-all duration-300 ease-in-out min-w-0
        ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}
      `}>
        {/* Top Navbar */}
        <AdminNavbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Page Content */}
        <main
          key={`${platform}:${location.pathname}`}
          className="flex-1  w-full max-w-full overflow-x-hidden bg-neutral-100"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <PlatformProvider>
      <AdminLayoutContent />
    </PlatformProvider>
  )
}
