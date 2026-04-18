import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { getCompanies } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";

function fmtCr(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const abs = Math.abs(val);
  if (abs >= 1000) return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  return `₹${val.toFixed(1)} Cr`;
}

function fmtCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  if (val >= 10_000_000) return `${(val / 10_000_000).toFixed(1)} Cr`;
  if (val >= 100_000) return `${(val / 100_000).toFixed(1)} L`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("en-IN");
}

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b"];

export default function CompanyDetail() {
  const params = useParams<{ name: string }>();
  const [, setLocation] = useLocation();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const decodedName = decodeURIComponent(params.name || "");

  useEffect(() => {
    getCompanies()
      .then((d: any) => {
        const all: any[] = d.companies ?? [];
        const found = all.find(
          (c: any) => (c.displayName ?? c.company ?? "").toLowerCase() === decodedName.toLowerCase()
        );
        setCompany(found ?? null);
      })
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, [decodedName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Building2 className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Company "{decodedName}" not found.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const financials: any[] = (company.financials ?? []).slice().sort((a: any, b: any) => a.year - b.year);
  const hasFinancials = financials.length > 0;

  const chartData = financials.map((f: any) => ({
    year: `FY${String(f.year).slice(-2)}`,
    Revenue: f.revenue != null ? Math.round(f.revenue * 100) / 100 : undefined,
    EBITDA: f.ebitda != null ? Math.round(f.ebitda * 100) / 100 : undefined,
    Profit: f.profit != null ? Math.round(f.profit * 100) / 100 : undefined,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.displayName ?? decodedName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {company.peerGroup === "p2p_lending" ? "P2P Lending" : "Wealth Management"} · Full Financial History
          </p>
        </div>
      </div>

      {!hasFinancials ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No financial data uploaded yet for {company.displayName ?? decodedName}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Financial History Table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Financial History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="text-left py-2 pr-4">Year</th>
                      <th className="text-right py-2 px-4">Revenue</th>
                      <th className="text-right py-2 px-4">EBITDA</th>
                      <th className="text-right py-2 px-4">Net Profit</th>
                      <th className="text-right py-2 px-4">AUM</th>
                      <th className="text-right py-2 pl-4">Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financials.map((f: any) => (
                      <tr key={f.year} className="border-b border-border/40 hover:bg-secondary/40 transition-colors">
                        <td className="py-2.5 pr-4 font-medium">FY{String(f.year).slice(-2)}</td>
                        <td className={`text-right py-2.5 px-4 tabular-nums ${f.revenue != null ? "" : "text-muted-foreground/40"}`}>
                          {fmtCr(f.revenue)}
                        </td>
                        <td className={`text-right py-2.5 px-4 tabular-nums ${f.ebitda != null ? (f.ebitda >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground/40"}`}>
                          {fmtCr(f.ebitda)}
                        </td>
                        <td className={`text-right py-2.5 px-4 tabular-nums ${f.profit != null ? (f.profit >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground/40"}`}>
                          {fmtCr(f.profit)}
                        </td>
                        <td className={`text-right py-2.5 px-4 tabular-nums ${f.aum != null ? "" : "text-muted-foreground/40"}`}>
                          {fmtCr(f.aum)}
                        </td>
                        <td className={`text-right py-2.5 pl-4 tabular-nums ${f.valuation != null ? "" : "text-muted-foreground/40"}`}>
                          {fmtCr(f.valuation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Chart */}
          {chartData.some(d => d.Revenue !== undefined) && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Revenue · EBITDA · Profit (INR Cr)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={64}
                        tickFormatter={v => `₹${v}`} />
                      <RechartsTooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                        formatter={(v: any) => [`₹${v} Cr`, undefined]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Revenue" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="EBITDA" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="Profit" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Users / Employees */}
          {financials.some((f: any) => f.users != null || f.employees != null) && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Operational Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left py-2 pr-4">Year</th>
                        <th className="text-right py-2 px-4">Users / Customers</th>
                        <th className="text-right py-2 pl-4">Employees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.map((f: any) => (
                        <tr key={f.year} className="border-b border-border/40 hover:bg-secondary/40 transition-colors">
                          <td className="py-2.5 pr-4 font-medium">FY{String(f.year).slice(-2)}</td>
                          <td className={`text-right py-2.5 px-4 tabular-nums ${f.users != null ? "" : "text-muted-foreground/40"}`}>
                            {fmtCount(f.users)}
                          </td>
                          <td className={`text-right py-2.5 pl-4 tabular-nums ${f.employees != null ? "" : "text-muted-foreground/40"}`}>
                            {fmtCount(f.employees)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
