import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/Toast";
import { api, patch, post, del } from "../../lib/api";
import { PageHeader, Button, Input, Textarea, Badge, CopyButton, Modal, useConfirmDialog } from "../../components/ui";

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

      {/* ---- Email Signatures ---- */}
      <SignaturesSection />
    </div>
  );
}

type Signature = {
  id: string;
  name: string;
  html_body: string;
  text_body: string | null;
  is_default: boolean;
};

function SignaturesSection() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSig, setEditSig] = useState<Signature | null>(null);
  const [form, setForm] = useState({ name: "", html_body: "", text_body: "", is_default: false });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const load = async () => {
    try {
      const res = await api<{ data: Signature[] }>("/dashboard/signatures");
      setSignatures(res.data);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditSig(null);
    setForm({ name: "", html_body: "", text_body: "", is_default: false });
    setModalOpen(true);
  };

  const openEdit = (sig: Signature) => {
    setEditSig(sig);
    setForm({ name: sig.name, html_body: sig.html_body, text_body: sig.text_body || "", is_default: sig.is_default });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: any = { name: form.name, html_body: form.html_body, is_default: form.is_default };
      if (form.text_body) body.text_body = form.text_body;
      if (editSig) {
        await patch(`/dashboard/signatures/${editSig.id}`, body);
      } else {
        await post("/dashboard/signatures", body);
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteSig = (sig: Signature) => {
    confirm({
      title: "Delete Signature",
      message: `Delete "${sig.name}"?`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await del(`/dashboard/signatures/${sig.id}`);
          load();
        } catch (err: any) {
          toast(err.message || "Failed to delete", "error");
        }
      },
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Email Signatures</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">Create signatures to append to outgoing emails</p>
        </div>
        <Button size="sm" onClick={openCreate}>+ New Signature</Button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editSig ? "Edit Signature" : "New Signature"} wide>
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Work Signature" />
          <Textarea label="HTML Body" value={form.html_body} onChange={(e) => setForm({ ...form, html_body: e.target.value })} rows={6} />
          <Textarea label="Plain Text (optional)" value={form.text_body} onChange={(e) => setForm({ ...form, text_body: e.target.value })} rows={3} />
          <label className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
            Set as default signature
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name || !form.html_body}>{saving ? "Saving..." : editSig ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>

      {signatures.length === 0 ? (
        <p className="text-[13px] text-gray-400 py-4 text-center">No signatures yet</p>
      ) : (
        <div className="space-y-2">
          {signatures.map((sig) => (
            <div key={sig.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{sig.name}</span>
                {sig.is_default && <Badge variant="success">Default</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => openEdit(sig)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => deleteSig(sig)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
