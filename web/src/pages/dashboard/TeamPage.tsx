import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, post, patch, del } from "../../lib/api";
import { PageHeader, Button, Input, Modal, Badge, Table, EmptyState, Select, useConfirmDialog, useToast } from "../../components/ui";

type Member = {
  id: string;
  account_id: string;
  account_name: string | null;
  account_email: string | null;
  role: string;
  mailboxes: string[] | null;
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  mailboxes: string[] | null;
  token: string;
  expires_at: string;
  created_at: string;
};

export default function TeamPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [domainName, setDomainName] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [form, setForm] = useState({ email: "", role: "member", mailboxes: "" });
  const [editForm, setEditForm] = useState({ role: "member", mailboxes: "" });
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const loadData = async () => {
    try {
      const [membersRes, invRes, domainRes] = await Promise.all([
        api<{ data: Member[] }>(`/dashboard/domains/${domainId}/members`),
        api<{ data: Invitation[] }>(`/dashboard/domains/${domainId}/invitations`),
        api<{ data: any }>(`/dashboard/domains/${domainId}`).catch(() => null),
      ]);
      setMembers(membersRes.data);
      setInvitations(invRes.data);
      if (domainRes?.data) setDomainName(domainRes.data.name);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [domainId]);

  const addMember = async () => {
    setSaving(true);
    try {
      const body: any = { email: form.email, role: form.role };
      if (form.mailboxes.trim()) {
        body.mailboxes = form.mailboxes.split(",").map((s) => s.trim()).filter(Boolean);
      }
      await post(`/dashboard/domains/${domainId}/members`, body);
      setAddOpen(false);
      setForm({ email: "", role: "member", mailboxes: "" });
      loadData();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveMemberEdit = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      const body: any = { role: editForm.role };
      if (editForm.mailboxes.trim()) {
        body.mailboxes = editForm.mailboxes.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        body.mailboxes = null;
      }
      await patch(`/dashboard/domains/${domainId}/members/${editMember.id}`, body);
      setEditMember(null);
      loadData();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = (member: Member) => {
    confirm({
      title: "Remove Member",
      message: `Remove ${member.account_email} from this domain?`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        try {
          await del(`/dashboard/domains/${domainId}/members/${member.id}`);
          loadData();
        } catch (err: any) { showError(err.message); }
      },
    });
  };

  const revokeInvitation = (inv: Invitation) => {
    confirm({
      title: "Revoke Invitation",
      message: `Cancel the invitation to ${inv.email}?`,
      confirmLabel: "Revoke",
      onConfirm: async () => {
        try {
          await del(`/dashboard/domains/${domainId}/invitations/${inv.id}`);
          loadData();
        } catch (err: any) { showError(err.message); }
      },
    });
  };

  const roleColor = (role: string) => {
    if (role === "owner") return "success";
    if (role === "admin") return "warning";
    return "default";
  };

  const myRole = members.find((m) => m.account_id === "self")?.role; // We'll check via backend

  return (
    <div>
      <PageHeader
        title={`Team — ${domainName || "Domain"}`}
        desc="Manage who can send and receive emails on this domain"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/dashboard/domains")}>Back to Domains</Button>
            <Button onClick={() => { setForm({ email: "", role: "member", mailboxes: "" }); setAddOpen(true); }}>+ Add Member</Button>
          </div>
        }
      />

      {/* Add member modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Team Member">
        <div className="space-y-3">
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
          <div>
            <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full h-10 px-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              <option value="member">Member (send/receive only)</option>
              <option value="admin">Admin (can manage team)</option>
            </select>
          </div>
          <Input
            label="Mailboxes (optional, comma-separated)"
            value={form.mailboxes}
            onChange={(e) => setForm({ ...form, mailboxes: e.target.value })}
            placeholder="john@domain.com, support@domain.com (empty = all)"
          />
          <p className="text-[12px] text-gray-500">If the user already has an account, they'll be added immediately. Otherwise, an invitation will be sent.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addMember} disabled={saving || !form.email}>{saving ? "Adding..." : "Add Member"}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit member modal */}
      <Modal open={!!editMember} onClose={() => setEditMember(null)} title={`Edit — ${editMember?.account_email}`}>
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              className="w-full h-10 px-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Input
            label="Mailboxes (comma-separated, empty = all)"
            value={editForm.mailboxes}
            onChange={(e) => setEditForm({ ...editForm, mailboxes: e.target.value })}
            placeholder="john@domain.com"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={saveMemberEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Members */}
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Members ({members.length})</h3>
            {members.length === 0 ? (
              <EmptyState title="No members" description="Add team members to share this domain." />
            ) : (
              <Table headers={["User", "Role", "Mailboxes", "Joined", ""]}>
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{m.account_name || "—"}</div>
                      <div className="text-xs text-gray-500">{m.account_email}</div>
                    </td>
                    <td className="px-4 py-2.5"><Badge variant={roleColor(m.role)}>{m.role}</Badge></td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {m.mailboxes ? m.mailboxes.join(", ") : <span className="text-gray-400 italic">All</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      {m.role !== "owner" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="secondary" onClick={() => {
                            setEditMember(m);
                            setEditForm({ role: m.role, mailboxes: m.mailboxes?.join(", ") || "" });
                          }}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => removeMember(m)}>Remove</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Pending Invitations ({invitations.length})</h3>
              <Table headers={["Email", "Role", "Expires", ""]}>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">{inv.email}</td>
                    <td className="px-4 py-2.5"><Badge variant={roleColor(inv.role)}>{inv.role}</Badge></td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="danger" onClick={() => revokeInvitation(inv)}>Revoke</Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </div>
      )}

      {confirmDialog}
      {toast}
    </div>
  );
}
