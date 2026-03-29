import { useState } from "react";
import { post } from "../../lib/api";
import { PageHeader } from "../../components/ui";

interface ValidationResult {
  email: string;
  result: "valid" | "invalid" | "risky" | "unknown";
  reason: string | null;
  mx_found: boolean;
  is_disposable: boolean;
  is_role_address: boolean;
  is_free_provider: boolean;
  suggested_correction: string | null;
}

const resultColors: Record<string, string> = {
  valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  invalid: "bg-red-50 text-red-700 border-red-200",
  risky: "bg-amber-50 text-amber-700 border-amber-200",
  unknown: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function ValidationPage() {
  const [email, setEmail] = useState("");
  const [batch, setBatch] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [batchResults, setBatchResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [tab, setTab] = useState<"single" | "batch">("single");

  const validateSingle = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await post("/dashboard/email-validation", { email: email.trim() });
      setResult(res.data);
    } catch (e: any) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const validateBatch = async () => {
    const emails = batch.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setBatchLoading(true);
    setBatchResults([]);
    try {
      const res = await post("/dashboard/email-validation/batch", { emails: emails.slice(0, 100) });
      setBatchResults(res.data);
    } catch {
      setBatchResults([]);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Email Validation" desc="Verify email addresses before sending to improve deliverability" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {(["single", "batch"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${tab === t ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}
          >
            {t === "single" ? "Single Email" : "Batch Validation"}
          </button>
        ))}
      </div>

      {tab === "single" ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
          <div className="flex gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && validateSingle()}
              placeholder="Enter an email address..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
            />
            <button
              onClick={validateSingle}
              disabled={loading || !email.trim()}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Validating..." : "Validate"}
            </button>
          </div>

          {result && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-[12px] font-medium border ${resultColors[result.result]}`}>
                  {result.result.toUpperCase()}
                </span>
                <span className="text-[13px] text-gray-600">{result.email}</span>
              </div>

              {result.reason && (
                <p className="text-[13px] text-gray-500">
                  Reason: <span className="text-gray-700 font-medium">{result.reason.replace(/_/g, " ")}</span>
                </p>
              )}

              {result.suggested_correction && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-[13px] text-blue-700">
                    Did you mean <button onClick={() => { setEmail(result.suggested_correction!); setResult(null); }} className="font-bold underline">{result.suggested_correction}</button>?
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "MX Records", value: result.mx_found },
                  { label: "Disposable", value: result.is_disposable },
                  { label: "Role Address", value: result.is_role_address },
                  { label: "Free Provider", value: result.is_free_provider },
                ].map((check) => (
                  <div key={check.label} className="rounded-lg border border-gray-200 p-3">
                    <p className="text-[11px] text-gray-500 uppercase mb-1">{check.label}</p>
                    <p className={`text-[13px] font-medium ${check.label === "MX Records" ? (check.value ? "text-emerald-600" : "text-red-600") : (check.value ? "text-amber-600" : "text-emerald-600")}`}>
                      {check.value ? "Yes" : "No"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
          <textarea
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder="Enter email addresses (one per line, comma-separated, or semicolon-separated)..."
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 resize-none font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[12px] text-gray-400">Max 100 emails per batch</span>
            <button
              onClick={validateBatch}
              disabled={batchLoading || !batch.trim()}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {batchLoading ? "Validating..." : "Validate All"}
            </button>
          </div>

          {batchResults.length > 0 && (
            <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2 text-[11px] font-medium text-gray-500 uppercase">Email</th>
                    <th className="text-left px-4 py-2 text-[11px] font-medium text-gray-500 uppercase">Result</th>
                    <th className="text-left px-4 py-2 text-[11px] font-medium text-gray-500 uppercase">Reason</th>
                    <th className="text-left px-4 py-2 text-[11px] font-medium text-gray-500 uppercase">Suggestion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batchResults.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-[13px] text-gray-900 font-mono">{r.email}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${resultColors[r.result]}`}>
                          {r.result}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[13px] text-gray-500">{r.reason?.replace(/_/g, " ") || "—"}</td>
                      <td className="px-4 py-2 text-[13px] text-blue-600">{r.suggested_correction || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
