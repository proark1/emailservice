import { useState, useEffect } from "react";
import { api, post, del } from "../../lib/api";
import { patch } from "../../lib/api";
import { EmptyState, PageHeader, Button, Input, Modal, useConfirmDialog, useToast } from "../../components/ui";

interface Mailbox {
  id: string;
  display_name: string;
  email: string;
  provider: "gmail" | "outlook" | "yahoo" | "icloud" | "custom";
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  username: string;
  status: "active" | "error" | "disconnected";
  error_message: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderPreset {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

type ProviderKey = "gmail" | "outlook" | "yahoo" | "icloud" | "custom";

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  yahoo: "Yahoo",
  icloud: "iCloud",
  custom: "Custom",
};

const PROVIDER_ICONS: Record<ProviderKey, string> = {
  gmail: "G",
  outlook: "O",
  yahoo: "Y",
  icloud: "i",
  custom: "✉",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  disconnected: "bg-gray-100 text-gray-500",
};

const emptyForm = {
  display_name: "",
  email: "",
  provider: "custom" as ProviderKey,
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: false,
  imap_host: "",
  imap_port: 993,
  imap_secure: true,
  username: "",
  password: "",
};

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [presets, setPresets] = useState<Record<ProviderKey, ProviderPreset>>({} as any);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editMailbox, setEditMailbox] = useState<Mailbox | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testedId, setTestedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ smtp: { ok: boolean; error?: string }; imap: { ok: boolean; error?: string } } | null>(null);

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [mbRes, presetsRes] = await Promise.all([
        api("/dashboard/mailboxes"),
        api("/dashboard/mailboxes/providers"),
      ]);
      setMailboxes(mbRes.data ?? []);
      setPresets(presetsRes.data ?? {});
    } catch {
      showError("Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(provider: ProviderKey) {
    const preset = presets[provider];
    if (!preset) return;
    setForm((f) => ({
      ...f,
      provider,
      smtp_host: preset.smtpHost,
      smtp_port: preset.smtpPort,
      smtp_secure: preset.smtpSecure,
      imap_host: preset.imapHost,
      imap_port: preset.imapPort,
      imap_secure: preset.imapSecure,
    }));
  }

  function openCreate() {
    setForm({ ...emptyForm });
    setTestResult(null);
    setTestedId(null);
    setShowCreate(true);
  }

  function openEdit(mailbox: Mailbox) {
    setForm({
      display_name: mailbox.display_name,
      email: mailbox.email,
      provider: mailbox.provider,
      smtp_host: mailbox.smtp_host,
      smtp_port: mailbox.smtp_port,
      smtp_secure: mailbox.smtp_secure,
      imap_host: mailbox.imap_host,
      imap_port: mailbox.imap_port,
      imap_secure: mailbox.imap_secure,
      username: mailbox.username,
      password: "",
    });
    setTestResult(null);
    setTestedId(null);
    setEditMailbox(mailbox);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editMailbox) {
        const body: Record<string, unknown> = {
          display_name: form.display_name,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          smtp_secure: form.smtp_secure,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          imap_secure: form.imap_secure,
          username: form.username,
        };
        if (form.password) body.password = form.password;
        await patch(`/dashboard/mailboxes/${editMailbox.id}`, body);
        setEditMailbox(null);
      } else {
        await post("/dashboard/mailboxes", {
          display_name: form.display_name,
          email: form.email,
          provider: form.provider,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          smtp_secure: form.smtp_secure,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          imap_secure: form.imap_secure,
          username: form.username,
          password: form.password,
        });
        setShowCreate(false);
      }
      await loadAll();
    } catch (err: any) {
      showError(err?.message ?? "Failed to save mailbox");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(mailbox: Mailbox) {
    confirm({
      title: "Remove mailbox?",
      message: `This will disconnect "${mailbox.display_name}" (${mailbox.email}). Synced emails will remain in your inbox.`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        try {
          await del(`/dashboard/mailboxes/${mailbox.id}`);
          await loadAll();
        } catch {
          showError("Failed to remove mailbox");
        }
      },
    });
  }

  async function handleTest(mailbox: Mailbox) {
    setTestingId(mailbox.id);
    setTestedId(null);
    setTestResult(null);
    try {
      const res = await post(`/dashboard/mailboxes/${mailbox.id}/test`, {});
      setTestResult(res.data);
      setTestedId(mailbox.id);
      await loadAll();
    } catch {
      showError("Connection test failed");
    } finally {
      setTestingId(null);
    }
  }

  async function handleSync(mailbox: Mailbox) {
    setSyncingId(mailbox.id);
    try {
      await post(`/dashboard/mailboxes/${mailbox.id}/sync`, {});
      await loadAll();
    } catch {
      showError("Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  const isFormOpen = showCreate || !!editMailbox;
  const formTitle = editMailbox ? `Edit "${editMailbox.display_name}"` : "Connect a Mailbox";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast}
      {confirmDialog}

      <PageHeader
        title="Connected Mailboxes"
        desc="Connect your Gmail, Outlook, or other mailboxes to send and receive emails through them directly."
        action={<Button onClick={openCreate}>Connect Mailbox</Button>}
      />

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : mailboxes.length === 0 ? (
        <EmptyState
          title="No mailboxes connected"
          desc="Connect a Gmail, Outlook, or custom mailbox to use it as a sending address and sync incoming mail."
          action={<Button onClick={openCreate}>Connect Mailbox</Button>}
        />
      ) : (
        <div className="space-y-3">
          {mailboxes.map((mb) => (
            <div key={mb.id} className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 shrink-0">
                    {PROVIDER_ICONS[mb.provider]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{mb.display_name}</div>
                    <div className="text-sm text-gray-500 truncate">{mb.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[mb.status]}`}>
                    {mb.status}
                  </span>
                </div>
              </div>

              {mb.error_message && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">{mb.error_message}</div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span>SMTP: {mb.smtp_host}:{mb.smtp_port}</span>
                <span>·</span>
                <span>IMAP: {mb.imap_host}:{mb.imap_port}</span>
                {mb.last_sync_at && (
                  <>
                    <span>·</span>
                    <span>Last sync: {new Date(mb.last_sync_at).toLocaleString()}</span>
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleTest(mb)} disabled={testingId === mb.id}>
                  {testingId === mb.id ? "Testing…" : "Test Connection"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleSync(mb)} disabled={syncingId === mb.id}>
                  {syncingId === mb.id ? "Syncing…" : "Sync Now"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openEdit(mb)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(mb)}>Remove</Button>
              </div>

              {testResult && testedId === mb.id && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className={`text-xs p-2 rounded ${testResult.smtp.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    SMTP: {testResult.smtp.ok ? "Connected" : testResult.smtp.error}
                  </div>
                  <div className={`text-xs p-2 rounded ${testResult.imap.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    IMAP: {testResult.imap.ok ? "Connected" : testResult.imap.error}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={isFormOpen} onClose={() => { setShowCreate(false); setEditMailbox(null); }} title={formTitle}>
        <div className="space-y-4">
          {/* Provider picker — only on create */}
          {!editMailbox && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Provider</div>
              <div className="grid grid-cols-3 gap-2">
                {(["gmail", "outlook", "yahoo", "icloud", "custom"] as ProviderKey[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`text-sm px-3 py-2 rounded border transition-colors ${
                      form.provider === p
                        ? "border-violet-500 bg-violet-50 text-violet-700 font-medium"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Input
              label="Display Name"
              placeholder="Work Gmail"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            />

            {!editMailbox && (
              <Input
                label="Email Address"
                type="email"
                placeholder="you@gmail.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            )}

            <Input
              label="Username"
              placeholder="Usually your email address"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />

            <Input
              label={editMailbox ? "New Password (leave blank to keep current)" : "Password / App Password"}
              type="password"
              placeholder={editMailbox ? "Leave blank to keep unchanged" : "App-specific password recommended"}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            {(form.provider === "gmail" || form.provider === "yahoo" || form.provider === "icloud") && (
              <p className="text-xs text-gray-500 -mt-2">
                Use an app-specific password rather than your account password. Enable 2FA first.
              </p>
            )}
          </div>

          {/* SMTP settings */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">SMTP (Outbound)</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input
                  label="Host"
                  placeholder="smtp.gmail.com"
                  value={form.smtp_host}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                />
              </div>
              <div>
                <Input
                  label="Port"
                  type="number"
                  placeholder="587"
                  value={String(form.smtp_port)}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) || 587 }))}
                />
              </div>
              <div className="col-span-3 flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  id="smtp_secure"
                  checked={form.smtp_secure}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_secure: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="smtp_secure">Use SSL/TLS (port 465). Unchecked = STARTTLS (port 587).</label>
              </div>
            </div>
          </div>

          {/* IMAP settings */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">IMAP (Inbound sync)</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input
                  label="Host"
                  placeholder="imap.gmail.com"
                  value={form.imap_host}
                  onChange={(e) => setForm((f) => ({ ...f, imap_host: e.target.value }))}
                />
              </div>
              <div>
                <Input
                  label="Port"
                  type="number"
                  placeholder="993"
                  value={String(form.imap_port)}
                  onChange={(e) => setForm((f) => ({ ...f, imap_port: parseInt(e.target.value) || 993 }))}
                />
              </div>
              <div className="col-span-3 flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  id="imap_secure"
                  checked={form.imap_secure}
                  onChange={(e) => setForm((f) => ({ ...f, imap_secure: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="imap_secure">Use SSL/TLS (recommended)</label>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editMailbox ? "Save Changes" : "Connect"}
            </Button>
            <Button variant="secondary" onClick={() => { setShowCreate(false); setEditMailbox(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
