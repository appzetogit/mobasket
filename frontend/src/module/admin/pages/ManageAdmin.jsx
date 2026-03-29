import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "@/lib/api";
import { adminAccessOptions } from "../data/adminAccessOptions";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "admin",
  isActive: true,
  sidebarAccess: [],
  assignedZoneIds: [],
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);
const normalizeZoneList = (value) => (Array.isArray(value) ? value : []);

export default function ManageAdmin() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [zonesByPlatform, setZonesByPlatform] = useState({ mofood: [], mogrocery: [] });
  const [zonesLoading, setZonesLoading] = useState(false);

  const currentAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem("admin_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const isSuperAdmin = String(currentAdmin?.role || "").toLowerCase() === "super_admin";
  const canManageAdmins = isSuperAdmin;

  const loadAdmins = async () => {
    if (!canManageAdmins) return;
    try {
      setLoading(true);
      const response = await adminAPI.getAdmins({ limit: 200, offset: 0 });
      const list = normalizeArray(response?.data?.data?.admins || response?.data?.admins);
      setAdmins(list);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load admins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageAdmins]);

  useEffect(() => {
    if (!canManageAdmins) return;

    const loadZones = async () => {
      try {
        setZonesLoading(true);
        const [mofoodResponse, mogroceryResponse] = await Promise.all([
          adminAPI.getZones({ limit: 1000, platform: "mofood" }),
          adminAPI.getZones({ limit: 1000, platform: "mogrocery" }),
        ]);

        setZonesByPlatform({
          mofood: normalizeZoneList(mofoodResponse?.data?.data?.zones || mofoodResponse?.data?.zones),
          mogrocery: normalizeZoneList(mogroceryResponse?.data?.data?.zones || mogroceryResponse?.data?.zones),
        });
      } catch (err) {
        console.error("Failed to load zones for admin assignment:", err);
        toast.error(err?.response?.data?.message || "Failed to load zones");
      } finally {
        setZonesLoading(false);
      }
    };

    loadZones();
  }, [canManageAdmins]);

  const handleToggleAccess = (path) => {
    setForm((prev) => {
      const exists = prev.sidebarAccess.includes(path);
      return {
        ...prev,
        sidebarAccess: exists
          ? prev.sidebarAccess.filter((entry) => entry !== path)
          : [...prev.sidebarAccess, path],
      };
    });
  };

  const handleToggleZone = (zoneId) => {
    setForm((prev) => {
      const normalizedId = String(zoneId || "");
      const exists = prev.assignedZoneIds.includes(normalizedId);
      return {
        ...prev,
        assignedZoneIds: exists
          ? prev.assignedZoneIds.filter((entry) => entry !== normalizedId)
          : [...prev.assignedZoneIds, normalizedId],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManageAdmins) return;

    setError("");
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        isActive: form.isActive,
        sidebarAccess: form.sidebarAccess,
        assignedZoneIds: form.assignedZoneIds,
      };

      let savedAdmin = null;
      if (!editingId) {
        payload.password = form.password;
        const response = await adminAPI.createAdmin(payload);
        savedAdmin = response?.data?.data?.admin || response?.data?.admin || null;
      } else {
        const response = await adminAPI.updateAdmin(editingId, payload);
        savedAdmin = response?.data?.data?.admin || response?.data?.admin || null;
      }

      const currentAdminId = String(currentAdmin?._id || currentAdmin?.id || "");
      if (savedAdmin && editingId && String(savedAdmin?._id || savedAdmin?.id || "") === currentAdminId) {
        localStorage.setItem("admin_user", JSON.stringify(savedAdmin));
        window.dispatchEvent(new Event("adminAuthChanged"));
      }

      setForm(emptyForm);
      setEditingId("");
      setError("");
      await loadAdmins();
      toast.success(editingId ? "Admin updated successfully" : "Admin created successfully");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save admin");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (admin) => {
    setEditingId(String(admin?._id || admin?.id || ""));
    setForm({
      name: admin?.name || "",
      email: admin?.email || "",
      password: "",
      phone: admin?.phone || "",
      role: admin?.role || "admin",
      isActive: admin?.isActive !== false,
      sidebarAccess: normalizeArray(admin?.sidebarAccess),
      assignedZoneIds: normalizeArray(admin?.assignedZoneIds).map((zone) => String(zone?._id || zone || "")),
    });
  };

  const cancelEdit = () => {
    setEditingId("");
    setForm(emptyForm);
    setError("");
  };

  const handleDelete = async (id) => {
    if (!canManageAdmins) return;
    if (!window.confirm("Delete this admin?")) return;
    try {
      await adminAPI.deleteAdmin(id);
      await loadAdmins();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete admin");
    }
  };

  if (!canManageAdmins) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Only super admin can manage admin users.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Manage Admin</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create admin accounts and control which sidebar pages they can access.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {editingId ? "Edit Admin" : "Create Admin"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            type="email"
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <input
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <select
            className="h-11 rounded-lg border border-slate-300 px-3 text-sm bg-white"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <label className="h-11 rounded-lg border border-slate-300 px-3 text-sm bg-white flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <span>Active account</span>
          </label>
          {!editingId && (
            <input
              type="password"
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm md:col-span-2"
              placeholder="Password (min 6 chars)"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              minLength={6}
              required
            />
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">Sidebar Access</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {Object.entries(adminAccessOptions).map(([platform, groups]) => (
              <div key={platform} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900 mb-3">
                  {platform === "mogrocery" ? "MoGrocery" : "MoFood"}
                </p>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {groups.map((group) => (
                    <div key={`${platform}-${group.group}`} className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {group.group}
                      </p>
                      {group.options.map((option) => (
                        <label key={`${platform}-${option.path}`} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={form.sidebarAccess.includes(option.path)}
                            onChange={() => handleToggleAccess(option.path)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Zone Assignment</h3>
            <p className="text-xs text-slate-500 mt-1">
              Assigned admins will only see and operate on orders from these zones. Leave empty for full zone visibility.
            </p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {["mofood", "mogrocery"].map((platform) => (
              <div key={platform} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900 mb-3">
                  {platform === "mogrocery" ? "MoGrocery" : "MoFood"}
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {zonesLoading ? (
                    <p className="text-sm text-slate-500">Loading zones...</p>
                  ) : normalizeZoneList(zonesByPlatform[platform]).length === 0 ? (
                    <p className="text-sm text-slate-500">No zones found.</p>
                  ) : (
                    normalizeZoneList(zonesByPlatform[platform]).map((zone) => {
                      const zoneId = String(zone?._id || zone?.id || "");
                      const zoneName = zone?.name || zone?.zoneName || "Unnamed Zone";
                      return (
                        <label key={`${platform}-${zoneId}`} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={form.assignedZoneIds.includes(zoneId)}
                            onChange={() => handleToggleZone(zoneId)}
                            className="mt-0.5"
                          />
                          <span>
                            {zoneName}
                            <span className="block text-xs text-slate-500">
                              {zone?.serviceLocation || zone?.country || zoneId}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded-lg bg-slate-900 text-white px-4 text-sm font-semibold disabled:opacity-60"
          >
            {submitting ? "Saving..." : editingId ? "Update Admin" : "Create Admin"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Admins</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading admins...</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-slate-500">No admins found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Access Count</th>
                  <th className="py-2 pr-4">Zones</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => {
                  const id = String(admin?._id || admin?.id || "");
                  return (
                    <tr key={id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium text-slate-900">{admin?.name || "-"}</td>
                      <td className="py-3 pr-4 text-slate-700">{admin?.email || "-"}</td>
                      <td className="py-3 pr-4 text-slate-700">{admin?.role || "admin"}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${admin?.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {admin?.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{normalizeArray(admin?.sidebarAccess).length}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        {normalizeArray(admin?.assignedZoneIds).length > 0
                          ? normalizeArray(admin?.assignedZoneIds)
                              .map((zone) => zone?.name || zone?.zoneName || "-")
                              .join(", ")
                          : "All zones"}
                      </td>
                      <td className="py-3 space-x-3">
                        <button type="button" onClick={() => startEdit(admin)} className="text-blue-600 font-semibold">
                          Edit
                        </button>
                        {id !== String(currentAdmin?._id || currentAdmin?.id || "") && (
                          <button type="button" onClick={() => handleDelete(id)} className="text-rose-600 font-semibold">
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
