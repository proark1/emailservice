import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { post } from "../lib/api";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "login_required">("loading");
  const [error, setError] = useState("");
  const [domainId, setDomainId] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setStatus("login_required");
      return;
    }

    // Accept the invitation
    (async () => {
      try {
        const res = await post<{ data: { success: boolean; domain_id: string } }>("/auth/accept-invitation", { token });
        setDomainId(res.data.domain_id);
        setStatus("success");
        setTimeout(() => navigate("/dashboard/domains"), 2000);
      } catch (err: any) {
        setError(err.message || "Failed to accept invitation");
        setStatus("error");
      }
    })();
  }, [user, authLoading, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        {status === "loading" && (
          <>
            <div className="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Accepting invitation...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Invitation Accepted!</h2>
            <p className="text-gray-500 text-sm">You now have access to the domain. Redirecting to dashboard...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Could not accept invitation</h2>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <Link to="/dashboard" className="text-violet-600 hover:underline text-sm">Go to dashboard</Link>
          </>
        )}

        {status === "login_required" && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Login Required</h2>
            <p className="text-gray-500 text-sm mb-6">You need to log in or create an account to accept this invitation.</p>
            <div className="flex gap-3 justify-center">
              <Link
                to={`/login?invite=${token}`}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
              >
                Log In
              </Link>
              <Link
                to={`/register?invite=${token}`}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Create Account
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
