import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, RefreshCw, AlertCircle } from "lucide-react";

interface TenantSummary {
  key: string;
  nameEn: string;
  nameTa: string;
  constituencyEn: string;
  constituencyTa: string;
  logoInitial: string;
  siteTitle: string;
  email: string;
}

interface TenantsResponse {
  tenants: TenantSummary[];
  activeKey: string | null;
}

export default function LeaderSwitchAdmin() {
  const [data, setData] = useState<TenantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  function load() {
    setLoading(true);
    setError(null);
    adminApi.getLeaderConfigTenants()
      .then((d: TenantsResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load accounts."); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) window.location.reload();
      else setCountdown(c => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function activate(tenant: TenantSummary) {
    if (activating) return;
    setActivating(tenant.key);
    setError(null);
    setSuccess(null);
    try {
      await adminApi.activateLeaderConfig(tenant.key);
      setData(prev => prev ? { ...prev, activeKey: tenant.key } : prev);
      setSuccess(tenant.nameEn);
      setCountdown(3);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Activation failed";
      setError(msg);
    } finally {
      setActivating(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading accounts…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Leader Account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Switch the active minister profile. The entire public website updates immediately after activation.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            <strong>{success}</strong> is now the active leader.&nbsp;
            Reloading in <strong>{countdown}s</strong> to apply changes…
          </span>
          <button
            className="ml-auto text-green-700 hover:text-green-900 underline text-xs"
            onClick={() => window.location.reload()}
          >
            Reload now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data?.tenants.map(tenant => {
          const isActive = data.activeKey === tenant.key;
          const isActivating = activating === tenant.key;
          return (
            <Card
              key={tenant.key}
              className={`relative transition-all ${
                isActive
                  ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {isActive && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Active
                </span>
              )}
              <CardContent className="pt-5 pb-5 px-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white shrink-0 ${
                    isActive ? "bg-primary" : "bg-gray-400"
                  }`}>
                    {tenant.logoInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{tenant.nameEn}</p>
                    <p className="text-xs text-muted-foreground truncate">{tenant.nameTa}</p>
                  </div>
                </div>

                <dl className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-gray-700 w-24">Constituency</dt>
                    <dd>{tenant.constituencyEn} / {tenant.constituencyTa}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-gray-700 w-24">Site title</dt>
                    <dd>{tenant.siteTitle}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-gray-700 w-24">Email</dt>
                    <dd className="truncate">{tenant.email}</dd>
                  </div>
                </dl>

                <Button
                  size="sm"
                  variant={isActive ? "outline" : "default"}
                  className="w-full"
                  disabled={isActive || !!activating}
                  onClick={() => activate(tenant)}
                >
                  {isActivating ? (
                    <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Activating…</>
                  ) : isActive ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1.5" />Currently Active</>
                  ) : (
                    <><RefreshCw className="w-3 h-3 mr-1.5" />Activate</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Only super admins can switch the active account. The change takes effect site-wide immediately after the page reloads.
      </p>
    </div>
  );
}
