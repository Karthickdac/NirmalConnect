import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Newspaper, Calendar, Activity, Image,
  Users, MessageSquare, HelpCircle, UserCircle, LogOut, Menu, X, ChevronRight,
} from "lucide-react";
import { isAuthenticated, removeToken, getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import GrievanceOfficer from "./GrievanceOfficer";
import Dashboard from "./admin/Dashboard";
import NewsAdmin from "./admin/NewsAdmin";
import EventsAdmin from "./admin/EventsAdmin";
import ActivitiesAdmin from "./admin/ActivitiesAdmin";
import GalleryAdmin from "./admin/GalleryAdmin";
import VolunteersAdmin from "./admin/VolunteersAdmin";
import FaqsAdmin from "./admin/FaqsAdmin";
import AboutAdmin from "./admin/AboutAdmin";
import type { Language } from "@/lib/i18n";

interface AdminProps { lang?: Language }

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "news", label: "News", icon: Newspaper },
  { id: "events", label: "Events", icon: Calendar },
  { id: "activities", label: "Activities", icon: Activity },
  { id: "gallery", label: "Gallery", icon: Image },
  { id: "volunteers", label: "Volunteers", icon: Users },
  { id: "grievances", label: "Grievances", icon: MessageSquare },
  { id: "faqs", label: "FAQs", icon: HelpCircle },
  { id: "about", label: "About CMS", icon: UserCircle },
];

export default function Admin({ lang = "ta" }: AdminProps) {
  const [, setLocation] = useLocation();
  const { data: me, error } = useGetMe();
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { if (!isAuthenticated()) setLocation("/login"); }, []);
  useEffect(() => { if (error) { removeToken(); setLocation("/login"); } }, [error]);

  function logout() { removeToken(); setLocation("/login"); }

  const token = getToken() ?? "";

  const role = me?.role ?? "";
  const isAdmin = ["super_admin", "admin"].includes(role);

  const visibleNav = NAV_ITEMS.filter(item => {
    if (item.id === "about") return isAdmin;
    return true;
  });

  function navigate(id: string) {
    setActive(id);
    setSidebarOpen(false);
  }

  const currentItem = visibleNav.find(n => n.id === active) ?? visibleNav[0];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Dark Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-gray-950 text-white flex flex-col transition-transform duration-200
        lg:static lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Brand */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-sm shrink-0">N</div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">Nirmal Connect</p>
              <p className="text-xs text-gray-400 truncate">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* User info */}
        {me && (
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-sm font-medium truncate">{me.name}</p>
            <p className="text-xs text-gray-400 capitalize truncate">{me.role.replace("_", " ")}</p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                data-testid={`admin-nav-${item.id}`}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left
                  ${isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/10"}
                `}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-2 py-3 border-t border-white/10">
          <button
            onClick={logout}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <currentItem.icon className="w-4 h-4 text-primary" />
            <h1 className="font-semibold text-sm text-gray-900">{currentItem.label}</h1>
          </div>
          <div className="ml-auto">
            <span className="text-xs text-muted-foreground hidden sm:inline">Tirupparankundram Constituency</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {active === "dashboard" && <Dashboard />}
          {active === "news" && <NewsAdmin />}
          {active === "events" && <EventsAdmin />}
          {active === "activities" && <ActivitiesAdmin />}
          {active === "gallery" && <GalleryAdmin />}
          {active === "volunteers" && <VolunteersAdmin />}
          {active === "grievances" && <GrievanceOfficer lang={lang} token={token} />}
          {active === "faqs" && <FaqsAdmin />}
          {active === "about" && isAdmin && <AboutAdmin />}
        </main>
      </div>
    </div>
  );
}
