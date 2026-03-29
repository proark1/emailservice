import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { PageHeader } from "../../components/ui";

type Granularity = "day" | "week";

interface TimeSeriesPoint {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
}

interface DomainBreakdown {
  domain_id: string;
  domain_name: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
}

interface Funnel {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [domains, setDomains] = useState<DomainBreakdown[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - range * 86400000).toISOString().split("T")[0];
    const params = `start_date=${start}&end_date=${end}`;

    Promise.all([
      api(`/dashboard/analytics/timeseries?${params}&granularity=${granularity}`).then((r) => setTimeseries(r.data)).catch(() => setTimeseries([])),
      api(`/dashboard/analytics/domains?${params}`).then((r) => setDomains(r.data)).catch(() => setDomains([])),
      api(`/dashboard/analytics/funnel?${params}`).then((r) => setFunnel(r.data)).catch(() => setFunnel(null)),
    ]).finally(() => setLoading(false));
  }, [range, granularity]);

  const maxSent = Math.max(...timeseries.map((p) => p.sent), 1);

  return (
    <div>
      <PageHeader title="Analytics" desc="Track your email performance over time" />

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setRange(d)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${range === d ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}
          >
            {d}d
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(["day", "week"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${granularity === g ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}
            >
              {g === "day" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Time Series Chart */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Emails Over Time</h2>
            {timeseries.length === 0 ? (
              <p className="text-[13px] text-gray-400 py-8 text-center">No data for this period.</p>
            ) : (
              <div className="space-y-2">
                {timeseries.map((p) => (
                  <div key={p.date} className="flex items-center gap-3">
                    <span className="text-[12px] text-gray-500 w-20 shrink-0 font-mono">{p.date}</span>
                    <div className="flex-1 h-6 bg-gray-50 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full bg-violet-500/20 rounded-lg transition-all"
                        style={{ width: `${Math.max((p.sent / maxSent) * 100, 2)}%` }}
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium text-gray-600">
                        {p.sent.toLocaleString()} sent
                      </span>
                    </div>
                    <div className="flex gap-3 shrink-0 text-[11px]">
                      <span className="text-emerald-600">{p.delivered} del</span>
                      <span className="text-blue-600">{p.opened} opn</span>
                      <span className="text-amber-600">{p.bounced} bnc</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Funnel */}
          {funnel && funnel.sent > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
              <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Conversion Funnel</h2>
              <div className="grid grid-cols-4 gap-3">
                {([
                  { label: "Sent", value: funnel.sent, color: "bg-gray-500" },
                  { label: "Delivered", value: funnel.delivered, color: "bg-emerald-500", pct: funnel.sent > 0 ? ((funnel.delivered / funnel.sent) * 100).toFixed(1) : "0" },
                  { label: "Opened", value: funnel.opened, color: "bg-blue-500", pct: funnel.delivered > 0 ? ((funnel.opened / funnel.delivered) * 100).toFixed(1) : "0" },
                  { label: "Clicked", value: funnel.clicked, color: "bg-cyan-500", pct: funnel.opened > 0 ? ((funnel.clicked / funnel.opened) * 100).toFixed(1) : "0" },
                ] as const).map((step) => (
                  <div key={step.label} className="text-center">
                    <div className={`mx-auto w-16 h-2 ${step.color} rounded-full mb-2`} style={{ opacity: step.value > 0 ? Math.max(0.3, step.value / funnel.sent) : 0.15 }} />
                    <p className="text-xl font-bold text-gray-900">{step.value.toLocaleString()}</p>
                    <p className="text-[12px] text-gray-500">{step.label}</p>
                    {"pct" in step && <p className="text-[11px] text-gray-400">{step.pct}%</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Domain Breakdown */}
          {domains.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-[14px] font-semibold text-gray-900">Domain Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Domain</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Sent</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Delivered</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Bounced</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Opened</th>
                      <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Clicked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {domains.map((d) => (
                      <tr key={d.domain_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-[13px] text-gray-900 font-mono">{d.domain_name}</td>
                        <td className="px-4 py-2 text-[13px] text-gray-600 text-right">{d.sent.toLocaleString()}</td>
                        <td className="px-4 py-2 text-[13px] text-emerald-600 text-right">{d.delivered.toLocaleString()}</td>
                        <td className="px-4 py-2 text-[13px] text-amber-600 text-right">{d.bounced.toLocaleString()}</td>
                        <td className="px-4 py-2 text-[13px] text-blue-600 text-right">{d.opened.toLocaleString()}</td>
                        <td className="px-4 py-2 text-[13px] text-cyan-600 text-right">{d.clicked.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
