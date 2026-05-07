import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Newspaper, Calendar, Activity, Image,
  Users, MessageSquare, HelpCircle, UserCircle, LogOut, Menu, X,
  ChevronRight, Settings, Megaphone, FileText, MapPin, ClipboardList, Network, Map as MapIcon, BarChart3, Home as HomeIcon, ShieldAlert,
} from "lucide-react";
import { isAuthenticated, removeToken, getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
const ConstituencyMap = lazy(() => import("@/components/maps/ConstituencyMap"));
import GrievanceOfficer from "./GrievanceOfficer";
import Dashboard from "./admin/Dashboard";
import Analytics from "./admin/Analytics";
import NewsAdmin from "./admin/NewsAdmin";
import EventsAdmin from "./admin/EventsAdmin";
import ActivitiesAdmin from "./admin/ActivitiesAdmin";
import GalleryAdmin from "./admin/GalleryAdmin";
import VolunteersAdmin from "./admin/VolunteersAdmin";
import FaqsAdmin from "./admin/FaqsAdmin";
import AboutAdmin from "./admin/AboutAdmin";
import HomeAdmin from "./admin/HomeAdmin";
import SiteSettingsAdmin from "./admin/SiteSettingsAdmin";
import AuditLogAdmin from "./admin/AuditLogAdmin";
import BannersAdmin from "./admin/BannersAdmin";
import ConstituencyAdmin from "./admin/ConstituencyAdmin";
import WardAdmin from "./admin/WardAdmin";
import HierarchyAdmin from "./admin/HierarchyAdmin";
import VoterRollAdmin from "./admin/VoterRollAdmin";
import VotersAdmin from "./admin/VotersAdmin";
import PressReleasesAdmin from "./admin/PressReleasesAdmin";
import AssignmentsAdmin from "./admin/AssignmentsAdmin";
import type { Language } from "@/lib/i18n";
import { UnsavedChangesProvider, useConfirmDiscard } from "@/lib/unsavedChanges";

interface AdminProps { lang?: Language }

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

// roles: undefined = all staff; listed = only those roles
const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",    label: "Dashboard",         icon: LayoutDashboard },
  { id: "grievances",   label: "Grievances",        icon: MessageSquare },
  { id: "assignments",  label: "Officer Assignments", icon: Network,    roles: ["super_admin", "admin", "constituency_coordinator"] },
  { id: "map",          label: "Constituency Map",   icon: MapIcon },
  { id: "analytics",    label: "Analytics",          icon: BarChart3,   roles: ["super_admin", "admin", "constituency_coordinator"] },
  { id: "news",         label: "News",               icon: Newspaper,    roles: ["super_admin", "admin", "pa_staff", "media_team"] },
  { id: "press",        label: "Press Releases",    icon: FileText,     roles: ["super_admin", "admin", "pa_staff", "media_team"] },
  { id: "events",       label: "Events",             icon: Calendar,     roles: ["super_admin", "admin", "pa_staff", "constituency_coordinator", "media_team"] },
  { id: "activities",   label: "Activities",         icon: Activity,     roles: ["super_admin", "admin", "pa_staff", "constituency_coordinator", "media_team"] },
  { id: "gallery",      label: "Gallery",            icon: Image,        roles: ["super_admin", "admin", "pa_staff", "media_team"] },
  { id: "banners",      label: "Banners",            icon: Megaphone,    roles: ["super_admin", "admin", "pa_staff"] },
  { id: "volunteers",   label: "Volunteers",         icon: Users,        roles: ["super_admin", "admin", "pa_staff", "constituency_coordinator"] },
  { id: "constituency", label: "Constituency & Wards", icon: MapPin,      roles: ["super_admin", "admin", "pa_staff", "constituency_coordinator"] },
  { id: "voters-search", label: "Voters",               icon: Users,        roles: ["super_admin", "admin", "minister", "constituency_coordinator", "grievance_officer", "pa_staff"] },
  { id: "voters",       label: "Voter Roll",            icon: ShieldAlert, roles: ["super_admin"] },
  { id: "faqs",         label: "FAQs",               icon: HelpCircle,   roles: ["super_admin", "admin", "pa_staff"] },
  { id: "home",         label: "Home CMS",           icon: HomeIcon,     roles: ["super_admin", "admin"] },
  { id: "about",        label: "About CMS",          icon: UserCircle,   roles: ["super_admin", "admin"] },
  { id: "settings",     label: "Site Settings",      icon: Settings,     roles: ["super_admin", "admin"] },
  { id: "audit",        label: "Audit Log",          icon: ClipboardList, roles: ["super_admin", "admin"] },
];

export default function Admin({ lang = "ta" }: AdminProps) {
  return (
    <UnsavedChangesProvider>
      <AdminInner lang={lang} />
    </UnsavedChangesProvider>
  );
}

function AdminInner({ lang = "ta" }: AdminProps) {
  const [, setLocation] = useLocation();
  const confirmDiscard = useConfirmDiscard();
  const { data: me, error } = useGetMe();
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { if (!isAuthenticated()) setLocation("/login"); }, []);
  useEffect(() => { if (error) { removeToken(); setLocation("/login"); } }, [error]);

  function logout() {
    if (!confirmDiscard("You have unsaved changes. Discard them and sign out?")) return;
    removeToken();
    setLocation("/login");
  }

  const token = getToken() ?? "";
  const role = me?.role ?? "";
  const isAdminRole = ["super_admin", "admin", "constituency_coordinator"].includes(role);
  const [mapHeatPoints, setMapHeatPoints] = useState<Array<{ lat: number; lng: number; weight: number }> | undefined>(undefined);
  useEffect(() => {
    if (!isAdminRole) { setMapHeatPoints(undefined); return; }
    const t = getToken();
    if (!t) return;
    let cancelled = false;
    fetch(`/api/admin/analytics/grievances`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { heatPoints?: Array<{ lat: number; lng: number; weight: number }> } | null) => {
        if (!cancelled && j?.heatPoints) setMapHeatPoints(j.heatPoints);
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [isAdminRole]);

  // Fetch the logged-in officer's assignments so the embedded map can offer
  // a "show only my ward" toggle. Skipped for super_admin/admin who already
  // see everything.
  const isOfficer = role === "grievance_officer" || role === "constituency_coordinator";
  // Read assignments via the dedicated /admin/my-assignments endpoint —
  // /admin/assignments requires WARD_ROLES, which excludes grievance_officer,
  // so officers must use this self-scoped route instead.
  const { data: myAssignments } = useQuery<{
    items: Array<{ wardId: number | null; areaId: number | null; pollingStationId: number | null }>;
    wardIds: number[];
    areaIds: number[];
    pollingStationIds: number[];
  }>({
    queryKey: ["map-my-assignments", me?.id],
    queryFn: async () => {
      const tok = getToken();
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const r = await fetch(`${base}/api/admin/my-assignments`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
      });
      if (!r.ok) throw new Error("Failed to load assignments");
      return r.json();
    },
    enabled: Boolean(me?.id && isOfficer),
    staleTime: 60_000,
  });
  // Server returns the full ward set already expanded across ward/area/booth
  // assignments, so the map filter honours every assignment granularity.
  const officerWardIds = useMemo(() => myAssignments?.wardIds ?? [], [myAssignments]);
  const officerAreaIds = useMemo(() => myAssignments?.areaIds ?? [], [myAssignments]);
  const officerPollingStationIds = useMemo(
    () => myAssignments?.pollingStationIds ?? [],
    [myAssignments],
  );

  const STAFF_ROLES = ["super_admin", "admin", "pa_staff", "media_team", "constituency_coordinator", "grievance_officer", "minister", "staff"];

  // Authenticated but not a staff role → show forbidden screen
  if (me && !STAFF_ROLES.includes(role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          Your account (<strong>{me.email}</strong>) does not have staff privileges to access the admin panel.
        </p>
        <Button variant="outline" onClick={logout}>Sign out</Button>
      </div>
    );
  }

  const visibleNav = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  // Ensure active tab is accessible; reset to dashboard if not
  useEffect(() => {
    if (role && !visibleNav.find(n => n.id === active)) {
      setActive("dashboard");
    }
  }, [role]);

  function navigate(id: string) {
    if (id === active) { setSidebarOpen(false); return; }
    if (!confirmDiscard()) return;
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
            <p className="text-xs text-gray-400 capitalize truncate">{me.role.replace(/_/g, " ")}</p>
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
          {currentItem && (
            <div className="flex items-center gap-2">
              <currentItem.icon className="w-4 h-4 text-primary" />
              <h1 className="font-semibold text-sm text-gray-900">{currentItem.label}</h1>
            </div>
          )}
          <div className="ml-auto">
            <span className="text-xs text-muted-foreground hidden sm:inline">Tirupparankundram Constituency</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {active === "dashboard"    && <Dashboard />}
          {active === "grievances"   && <GrievanceOfficer lang={lang} token={token} userRole={role} />}
          {active === "assignments"  && <AssignmentsAdmin token={token} />}
          {active === "map"          && (
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading map…</div>}>
              <ConstituencyMap
                lang={lang}
                adminMode
                officerWardIds={isOfficer ? officerWardIds : undefined}
                officerAreaIds={isOfficer ? officerAreaIds : undefined}
                officerPollingStationIds={isOfficer ? officerPollingStationIds : undefined}
                height="calc(100vh - 130px)"
                heatPoints={isAdminRole ? mapHeatPoints : undefined}
              />
            </Suspense>
          )}
          {active === "analytics"   && (
            <Analytics
              lang={lang}
              officerWardIds={isOfficer ? officerWardIds : undefined}
              officerAreaIds={isOfficer ? officerAreaIds : undefined}
              officerPollingStationIds={isOfficer ? officerPollingStationIds : undefined}
            />
          )}
          {active === "news"         && <NewsAdmin />}
          {active === "press"        && <PressReleasesAdmin />}
          {active === "events"       && <EventsAdmin />}
          {active === "activities"   && <ActivitiesAdmin />}
          {active === "gallery"      && <GalleryAdmin />}
          {active === "banners"      && <BannersAdmin />}
          {active === "volunteers"   && <VolunteersAdmin />}
          {active === "constituency" && (
            <div className="space-y-6">
              <ConstituencyAdmin />
              <div className="border-t pt-4">
                <HierarchyAdmin />
              </div>
              <details className="border-t pt-4 group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
                  Legacy ward coordinator list (flat view)
                </summary>
                <div className="mt-3">
                  <WardAdmin />
                </div>
              </details>
            </div>
          )}
          {active === "faqs"         && <FaqsAdmin />}
          {active === "home"         && <HomeAdmin />}
          {active === "about"        && <AboutAdmin />}
          {active === "settings"     && <SiteSettingsAdmin />}
          {active === "audit"        && <AuditLogAdmin />}
          {active === "voters"       && <VoterRollAdmin />}
          {active === "voters-search" && <VotersAdmin />}
        </main>
      </div>
    </div>
  );
}
