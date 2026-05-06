import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard, FileText, Calendar, Image, Users,
  MessageSquare, LogOut, Settings,
} from "lucide-react";
import { isAuthenticated, removeToken, getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import GrievanceOfficer from "./GrievanceOfficer";
import type { Language } from "@/lib/i18n";

interface AdminProps { lang?: Language }

export default function Admin({ lang = "ta" }: AdminProps) {
  const [, setLocation] = useLocation();
  const { data: me, error } = useGetMe();
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    if (!isAuthenticated()) setLocation("/login");
  }, []);

  useEffect(() => {
    if (error) { removeToken(); setLocation("/login"); }
  }, [error]);

  function logout() {
    removeToken();
    setLocation("/login");
  }

  const modules = [
    { icon: FileText, label: "News & Announcements", count: "10" },
    { icon: Calendar, label: "Events", count: "5" },
    { icon: Image, label: "Media Gallery", count: "20" },
    { icon: Users, label: "Volunteers", count: "50+" },
    { icon: Settings, label: "Site Settings", count: "" },
  ];

  const token = getToken() ?? "";

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-gray-950 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">N</div>
          <div>
            <p className="font-semibold text-sm">Nirmal Connect Admin</p>
            {me && <p className="text-xs text-gray-400">{me.name} – {me.role}</p>}
          </div>
        </div>
        <Button
          data-testid="logout-btn"
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-gray-400 hover:text-white"
        >
          <LogOut className="w-4 h-4 mr-1" /> Logout
        </Button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="grievances" data-testid="admin-tab-grievances" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Grievances
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <div className="mb-6">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <LayoutDashboard className="w-6 h-6 text-primary" />
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Manage content, grievances, and constituency operations
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {modules.map((m, i) => (
                <Card key={i} className="hover:shadow-md transition-all cursor-pointer group" data-testid={`admin-module-${i}`}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                      <m.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{m.label}</p>
                      {m.count && <p className="text-xs text-muted-foreground">{m.count} records</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card
                className="hover:shadow-md transition-all cursor-pointer group border-primary/30 bg-primary/5"
                onClick={() => setActiveTab("grievances")}
                data-testid="admin-module-grievances"
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 group-hover:bg-primary/30 flex items-center justify-center transition-colors">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Grievance Officer Panel</p>
                    <p className="text-xs text-primary">Click to manage tickets →</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6 text-center">
                <h3 className="font-bold text-lg mb-2">Full Admin CMS Coming in Task #3</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Content editor, analytics dashboard, volunteer management, and audit logs will be built in the next phase.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="grievances">
            <GrievanceOfficer lang={lang} token={token} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
