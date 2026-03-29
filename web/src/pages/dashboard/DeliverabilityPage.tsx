import { useState, useEffect } from "react";
import { api, post } from "../../lib/api";
import { PageHeader } from "../../components/ui";

interface BlacklistCheck {
  id: string;
  target: string;
  target_type: string;
  blacklist_name: string;
  listed: boolean;
  listed_reason: string | null;
  checked_at: string;
}

interface ReputationData {
  overall_score: number;
  breakdown: { category: string; score: number; weight: number; details: string }[];
}

export default function DeliverabilityPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blacklists, setBlacklists] = useState<BlacklistCheck[]>([]);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([
      api("/dashboard/deliverability").then((r) => setData(r.data)).catch((e: any) => setError(e.message || "Failed to load")),
      api("/dashboard/deliverability/blacklists").then((r) => setBlacklists(r.data)).catch(() => {}),
      api("/dashboard/deliverability/reputation").then((r) => setReputation(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const runBlacklistCheck = async () => {
    setChecking(true);
    try {
      const res = await post("/dashboard/deliverability/blacklists/check", {});
      setBlacklists(res.data);
    } catch {}
    setChecking(false);
  };

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;
  if (!data) return null;

  const scoreColor = data.score >= 80 ? "text-emerald-600" : data.score >= 60 ? "text-amber-600" : "text-red-600";
  const scoreLabel = data.score >= 80 ? "Healthy" : data.score >= 60 ? "Needs Attention" : "Critical";
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const listedCount = blacklists.filter((b) => b.listed).length;

  return (
    <div>
      <PageHeader title="Deliverability" desc="Monitor your sender reputation and email health" />

      {/* Score + Key Rates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 flex flex-col items-center justify-center">
          <svg className="w-32 h-32" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" strokeWidth="8" stroke="#e5e7eb" />
            <circle cx="60" cy="60" r="50" fill="none" strokeWidth="8"
              stroke={data.score >= 80 ? "#10b981" : data.score >= 60 ? "#f59e0b" : "#ef4444"}
              strokeLinecap="round"
              strokeDasharray={`${(data.score / 100) * 314} 314`}
              transform="rotate(-90 60 60)"
              className="transition-all duration-1000"
            />
            <text x="60" y="55" textAnchor="middle" className="text-3xl font-bold fill-gray-900">{data.score}</text>
            <text x="60" y="72" textAnchor="middle" className="text-[11px] fill-gray-500">out of 100</text>
          </svg>
          <p className="text-[13px] text-gray-500 mt-2">Reputation Score</p>
          <span className={`mt-2 px-3 py-1 rounded-full text-[12px] font-medium ${data.score >= 80 ? "bg-emerald-50 text-emerald-700" : data.score >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{scoreLabel}</span>
        </div>
        <div className="col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Delivery Rate", value: pct(data.rates.delivery), good: data.rates.delivery >= 0.95 },
            { label: "Bounce Rate", value: pct(data.rates.bounce), good: data.rates.bounce < 0.05 },
            { label: "Complaint Rate", value: pct(data.rates.complaint), good: data.rates.complaint < 0.001 },
            { label: "Open Rate", value: pct(data.rates.open), good: data.rates.open > 0.15 },
            { label: "Click Rate", value: pct(data.rates.click), good: data.rates.click > 0.02 },
            { label: "Suppressions", value: data.totals.suppressions.toLocaleString(), good: true },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{m.label}</p>
              <p className={`text-xl font-bold ${m.good ? "text-gray-900" : "text-amber-600"}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Volume Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          { label: "Sent", value: data.totals.sent },
          { label: "Delivered", value: data.totals.delivered },
          { label: "Bounced", value: data.totals.bounced },
          { label: "Failed", value: data.totals.failed },
          { label: "Complained", value: data.totals.complained },
          { label: "Opens", value: data.totals.opens },
          { label: "Clicks", value: data.totals.clicks },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <p className="text-[11px] text-gray-500 uppercase mb-1">{s.label}</p>
            <p className="text-lg font-bold text-gray-900">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Blacklist Status */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-900">Blacklist Monitoring</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {listedCount > 0 ? `Listed on ${listedCount} blacklist${listedCount > 1 ? "s" : ""}` : blacklists.length > 0 ? "All clear — not listed on any blacklists" : "No checks yet"}
            </p>
          </div>
          <button
            onClick={runBlacklistCheck}
            disabled={checking}
            className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {checking ? "Checking..." : "Check Now"}
          </button>
        </div>
        {blacklists.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {blacklists.map((bl) => (
              <div
                key={bl.id}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${bl.listed ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                title={bl.listed_reason || undefined}
              >
                {bl.blacklist_name}
                <span className="ml-1.5">{bl.listed ? "\u2717" : "\u2713"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reputation Breakdown */}
      {reputation && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
          <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Reputation Breakdown</h2>
          <div className="space-y-3">
            {reputation.breakdown.map((item) => (
              <div key={item.category} className="flex items-center gap-3">
                <span className="text-[13px] text-gray-600 w-36 shrink-0">{item.category}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${item.score >= 80 ? "bg-emerald-500" : item.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <span className="text-[13px] font-medium text-gray-700 w-10 text-right">{item.score}</span>
                <span className="text-[11px] text-gray-400 w-16 text-right">wt: {item.weight}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {(data.rates.bounce >= 0.05 || data.rates.complaint >= 0.001 || listedCount > 0) && (
        <div className="mb-6 p-4 rounded-2xl border border-amber-200 bg-amber-50 space-y-2">
          <h3 className="text-[14px] font-semibold text-amber-700">Recommendations</h3>
          {data.rates.bounce >= 0.05 && <p className="text-[13px] text-amber-600">Your bounce rate ({pct(data.rates.bounce)}) is above 5%. Clean your contact lists and remove invalid addresses.</p>}
          {data.rates.complaint >= 0.001 && <p className="text-[13px] text-amber-600">Your complaint rate ({pct(data.rates.complaint)}) is above 0.1%. Review your sending practices and ensure recipients opted in.</p>}
          {listedCount > 0 && <p className="text-[13px] text-amber-600">You are listed on {listedCount} blacklist{listedCount > 1 ? "s" : ""}. Visit the blacklist provider's website to request delisting.</p>}
        </div>
      )}

      {/* 7-Day Trend */}
      {data.daily.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-[14px] font-semibold text-gray-900">7-Day Trend</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200">
            <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Date</th>
            <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Sent</th>
            <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Bounced</th>
            <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Complained</th>
            <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Opens</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">{data.daily.map((d: any) => (
            <tr key={d.date} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-[13px] text-gray-600 font-mono">{d.date}</td>
              <td className="px-4 py-2 text-[13px] text-emerald-600 text-right">{d.sent}</td>
              <td className="px-4 py-2 text-[13px] text-amber-600 text-right">{d.bounced}</td>
              <td className="px-4 py-2 text-[13px] text-red-600 text-right">{d.complained}</td>
              <td className="px-4 py-2 text-[13px] text-blue-600 text-right">{d.opens}</td>
            </tr>
          ))}</tbody></table></div>
        </div>
      )}
    </div>
  );
}
