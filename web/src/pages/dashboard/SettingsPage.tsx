import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/Toast";
import { patch, post } from "../../lib/api";
import { PageHeader, Button, Input, Badge, CopyButton } from "../../components/ui";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) {
      toast("Name cannot be empty", "error");
      return;
    }
    setSavingName(true);
    try {
      await patch("/auth/profile", { name: name.trim() });
      await refreshUser();
      toast("Profile updated successfully");
    } catch (err: any) {
      toast(err.message || "Failed to update profile", "error");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast("Current password is required", "error");
      return;
    }
    if (newPassword.length < 8) {
      toast("New password must be at least 8 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setChangingPassword(true);
    try {
      await post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast(err.message || "Failed to change password", "error");
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader title="Settings" desc="Manage your account profile and security settings." />

      {/* Profile Section */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
        <h2 className="text-[15px] font-semibold text-gray-900 mb-4">Profile</h2>
        <div className="space-y-4 max-w-md">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
          <Button onClick={handleSaveName} disabled={savingName}>
            {savingName ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
        <h2 className="text-[15px] font-semibold text-gray-900 mb-4">Change Password</h2>
        <div className="space-y-4 max-w-md">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
          />
          <Button onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? "Changing..." : "Change Password"}
          </Button>
        </div>
      </div>

      {/* Account Info Section */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h2 className="text-[15px] font-semibold text-gray-900 mb-4">Account Info</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-gray-500 w-24">Account ID</span>
            <code className="text-[13px] text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded-lg">{user.id}</code>
            <CopyButton text={user.id} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-gray-500 w-24">Email</span>
            <span className="text-[13px] text-gray-900">{user.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-gray-500 w-24">Role</span>
            <Badge variant={user.role === "admin" ? "success" : "default"}>{user.role}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
