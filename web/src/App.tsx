import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import AcceptInvite from "./pages/AcceptInvite";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user || user.role !== "admin") return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-950"><div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/*" element={<AdminRoute><AdminPanel /></AdminRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
