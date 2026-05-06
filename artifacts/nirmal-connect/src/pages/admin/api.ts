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
  getNews: (page = 1, limit = 20) => authFetch(`/news?page=${page}&limit=${limit}`),
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
  getGallery: (page = 1, limit = 30) => authFetch(`/gallery?page=${page}&limit=${limit}`),
  createGallery: (data: unknown) => authFetch("/admin/gallery", { method: "POST", body: JSON.stringify(data) }),
  deleteGallery: (id: number) => authFetch(`/admin/gallery/${id}`, { method: "DELETE" }),
  // Volunteers
  getVolunteers: (page = 1, status?: string) =>
    authFetch(`/admin/volunteers?page=${page}&limit=20${status ? `&status=${status}` : ""}`),
  updateVolunteerStatus: (id: number, status: string) =>
    authFetch(`/admin/volunteers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  // FAQs
  getFaqs: () => authFetch("/admin/faqs"),
  createFaq: (data: unknown) => authFetch("/admin/faqs", { method: "POST", body: JSON.stringify(data) }),
  updateFaq: (id: number, data: unknown) => authFetch(`/admin/faqs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFaq: (id: number) => authFetch(`/admin/faqs/${id}`, { method: "DELETE" }),
  // About CMS
  getAbout: () => authFetch("/admin/about"),
  updateAbout: (data: unknown) => authFetch("/admin/about", { method: "PUT", body: JSON.stringify(data) }),
  // Audit log
  getAuditLog: () => authFetch("/admin/audit-log?limit=50"),
};
