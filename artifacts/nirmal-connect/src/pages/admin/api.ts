import { getToken } from "@/lib/auth";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const adminApi = {
  getDashboard: () => authFetch("/admin/dashboard"),
  // News
  getNews: (page = 1, limit = 20, category?: string) =>
    authFetch(`/news?page=${page}&limit=${limit}${category ? `&category=${encodeURIComponent(category)}` : ""}`),
  createNews: (data: unknown) => authFetch("/admin/news", { method: "POST", body: JSON.stringify(data) }),
  updateNews: (id: number, data: unknown) => authFetch(`/admin/news/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteNews: (id: number) => authFetch(`/admin/news/${id}`, { method: "DELETE" }),
  // Events
  getEvents: (page = 1, limit = 20) => authFetch(`/events?page=${page}&limit=${limit}`),
  createEvent: (data: unknown) => authFetch("/admin/events", { method: "POST", body: JSON.stringify(data) }),
  updateEvent: (id: number, data: unknown) => authFetch(`/admin/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteEvent: (id: number) => authFetch(`/admin/events/${id}`, { method: "DELETE" }),
  // Activities
  getActivities: (page = 1, limit = 20) => authFetch(`/activities?page=${page}&limit=${limit}`),
  createActivity: (data: unknown) => authFetch("/admin/activities", { method: "POST", body: JSON.stringify(data) }),
  updateActivity: (id: number, data: unknown) => authFetch(`/admin/activities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteActivity: (id: number) => authFetch(`/admin/activities/${id}`, { method: "DELETE" }),
  // Gallery
  getGallery: (page = 1, limit = 30, album?: string) =>
    authFetch(`/gallery?page=${page}&limit=${limit}${album ? `&album=${encodeURIComponent(album)}` : ""}`),
  createGallery: (data: unknown) => authFetch("/admin/gallery", { method: "POST", body: JSON.stringify(data) }),
  updateGallery: (id: number, data: unknown) => authFetch(`/admin/gallery/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteGallery: (id: number) => authFetch(`/admin/gallery/${id}`, { method: "DELETE" }),
  // Volunteers
  getVolunteers: (page = 1, status?: string) =>
    authFetch(`/admin/volunteers?page=${page}&limit=20${status ? `&status=${status}` : ""}`),
  updateVolunteerStatus: (id: number, status: string) =>
    authFetch(`/admin/volunteers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  exportVolunteersCSV: () => authFetch("/admin/volunteers/export"),
  // FAQs
  getFaqs: () => authFetch("/admin/faqs"),
  createFaq: (data: unknown) => authFetch("/admin/faqs", { method: "POST", body: JSON.stringify(data) }),
  updateFaq: (id: number, data: unknown) => authFetch(`/admin/faqs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFaq: (id: number) => authFetch(`/admin/faqs/${id}`, { method: "DELETE" }),
  // About CMS
  getAbout: () => authFetch("/admin/about"),
  updateAbout: (data: unknown) => authFetch("/admin/about", { method: "PUT", body: JSON.stringify(data) }),
  // Site Settings
  getSettings: () => authFetch("/admin/settings"),
  updateSetting: (key: string, value: unknown) => authFetch(`/admin/settings/${key}`, { method: "PUT", body: JSON.stringify(value) }),
  // Banners
  getBanners: () => authFetch("/admin/banners"),
  createBanner: (data: unknown) => authFetch("/admin/banners", { method: "POST", body: JSON.stringify(data) }),
  updateBanner: (id: number, data: unknown) => authFetch(`/admin/banners/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBanner: (id: number) => authFetch(`/admin/banners/${id}`, { method: "DELETE" }),
  // Constituency Stats
  getConstituencyStats: () => authFetch("/admin/constituency-stats"),
  updateConstituencyStats: (data: unknown) => authFetch("/admin/constituency-stats", { method: "PUT", body: JSON.stringify(data) }),
  // Grievances
  getGrievances: (page = 1, status?: string) =>
    authFetch(`/grievances?page=${page}&limit=20${status ? `&status=${status}` : ""}`),
  exportGrievancesCSV: () => authFetch("/admin/grievances/export"),
  bulkGrievanceStatus: (ids: number[], status: string) =>
    authFetch("/admin/grievances/bulk-status", { method: "POST", body: JSON.stringify({ ids, status }) }),
  // Audit log
  getAuditLog: (limit = 50) => authFetch(`/admin/audit-log?limit=${limit}`),
  // Wards
  getWards: () => authFetch("/admin/wards"),
  createWard: (data: unknown) => authFetch("/admin/wards", { method: "POST", body: JSON.stringify(data) }),
  updateWard: (id: number, data: unknown) => authFetch(`/admin/wards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWard: (id: number) => authFetch(`/admin/wards/${id}`, { method: "DELETE" }),
  // Grievance bulk assign
  bulkGrievanceAssign: (ids: number[], officerId: number, officerName: string) =>
    authFetch("/admin/grievances/bulk-assign", { method: "POST", body: JSON.stringify({ ids, officerId, officerName }) }),
  // Image upload (multipart)
  uploadImage: async (file: File): Promise<{ url: string; filename: string }> => {
    const token = getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/admin/upload`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
    return data;
  },
};
