import { useState, useEffect } from "react";
import { PageHeader, SkeletonCard } from "../../components/ui";
import { api } from "../../lib/api";

interface UsageData {
  current_month: {
    emails_sent: number;
    emails_delivered: number;
    period: string;
  };
  monthly: { month: string; count: number }[];
  resources: {
    domains: number;
    audiences: number;
    contacts: number;
    templates: number;
  };
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/dashboard/usage")
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Usage" desc="Monitor your email sending volume and resource usage" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Usage" desc="Monitor your email sending volume and resource usage" />
        <div className="flex items-center justify-center py-16 text-[13px] text-gray-400">Failed to load usage data.</div>
      </div>
    );
  }

  const maxMonthly = Math.max(...data.monthly.map((m) => m.count), 1);

  return (
    <div>
      <PageHeader title="Usage" desc="Monitor your email sending volume and resource usage" />

      {/* Current Month */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Current Month</h2>
          <span className="text-[13px] text-gray-500 dark:text-gray-400">{formatMonth(data.current_month.period)}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Emails Sent</p>
            <p className="text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{data.current_month.emails_sent.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Emails Delivered</p>
            <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">{data.current_month.emails_delivered.toLocaleString()}</p>
          </div>
        </div>
        {data.current_month.emails_sent > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[12px] text-gray-500 dark:text-gray-400 mb-1">
              <span>Delivery rate</span>
              <span>{data.current_month.emails_sent > 0 ? Math.round((data.current_month.emails_delivered / data.current_month.emails_sent) * 100) : 0}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${data.current_month.emails_sent > 0 ? (data.current_month.emails_delivered / data.current_month.emails_sent) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Monthly Trend */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-6 mb-6">
        <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 mb-4">Monthly Trend</h2>
        {data.monthly.length === 0 ? (
          <p className="text-[13px] text-gray-400 dark:text-gray-500 py-8 text-center">No email activity in the last 6 months.</p>
        ) : (
          <div className="space-y-3">
            {data.monthly.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-[13px] text-gray-500 dark:text-gray-400 w-28 shrink-0">{formatMonth(m.month)}</span>
                <div className="flex-1 h-8 bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-violet-500/20 dark:bg-violet-400/20 rounded-lg transition-all"
                    style={{ width: `${Math.max((m.count / maxMonthly) * 100, 2)}%` }}
                  />
                  <span className="absolute inset-y-0 left-3 flex items-center text-[13px] font-medium text-gray-700 dark:text-gray-300">
                    {m.count.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resource Usage */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: "Domains", value: data.resources.domains, icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" },
          { label: "Audiences", value: data.resources.audiences, icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
          { label: "Contacts", value: data.resources.contacts, icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
          { label: "Templates", value: data.resources.templates, icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
        ] as const).map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="text-[13px] text-gray-500 dark:text-gray-400">{item.label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
