import { useState, useEffect } from "react";
import { api, post, patch, del } from "../../lib/api";
import { PageHeader, Button, Modal, Input, Textarea, EmptyState, useConfirmDialog } from "../../components/ui";
import { useToast } from "../../components/Toast";

interface Draft {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  in_reply_to: string | null;
  references: string[] | null;
  created_at: string;
  updated_at: string;
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ from: "", to: "", subject: "", html: "" });
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();

  const loadDrafts = async () => {
    try {
      const res = await api<{ data: Draft[] }>("/dashboard/drafts");
      setDrafts(res.data);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDrafts(); }, []);

  const openNewDraft = () => {
    setEditDraft(null);
    setForm({ from: "", to: "", subject: "", html: "" });
    setComposeOpen(true);
  };

  const openExistingDraft = (draft: Draft) => {
    setEditDraft(draft);
    setForm({
      from: draft.from || "",
      to: (draft.to || []).join(", "),
      subject: draft.subject || "",
      html: draft.html || draft.text || "",
    });
    setComposeOpen(true);
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const body: any = {
        subject: form.subject || undefined,
        html: form.html || undefined,
      };
      if (form.from) body.from = form.from;
      if (form.to) body.to = form.to.split(",").map((s: string) => s.trim()).filter(Boolean);

      if (editDraft) {
        await patch(`/dashboard/drafts/${editDraft.id}`, body);
      } else {
        await post("/dashboard/drafts", body);
      }
      toast("Draft saved");
      setComposeOpen(false);
      loadDrafts();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const sendDraft = async (draftId: string) => {
    try {
      await post(`/dashboard/drafts/${draftId}/send`, {});
      toast("Draft sent");
      loadDrafts();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const deleteDraft = (draftId: string) => {
    confirm({
      title: "Delete Draft",
      message: "This draft will be permanently deleted.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await del(`/dashboard/drafts/${draftId}`);
          toast("Draft deleted");
          loadDrafts();
        } catch (err: any) {
          toast(err.message, "error");
        }
      },
    });
  };

  return (
    <div>
      <PageHeader title="Drafts" desc="Saved email drafts" action={<Button onClick={openNewDraft}>+ New Draft</Button>} />

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title={editDraft ? "Edit Draft" : "New Draft"} wide>
        <div className="space-y-3">
          <Input label="From" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="you@domain.com" />
          <Input label="To" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="recipient@example.com (comma-separated)" />
          <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Textarea label="Body (HTML)" value={form.html} onChange={(e) => setForm({ ...form, html: e.target.value })} rows={10} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={saveDraft} disabled={saving}>{saving ? "Saving..." : "Save Draft"}</Button>
            {editDraft && (
              <Button onClick={() => { setComposeOpen(false); sendDraft(editDraft.id); }}>Send</Button>
            )}
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : drafts.length === 0 ? (
        <EmptyState title="No drafts" desc="Saved drafts will appear here." action={<Button onClick={openNewDraft}>+ New Draft</Button>} />
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
              onClick={() => openExistingDraft(draft)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {draft.subject || "(no subject)"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  To: {(draft.to || []).join(", ") || "(no recipients)"}
                </div>
              </div>
              <div className="text-xs text-gray-400 shrink-0">
                {new Date(draft.updated_at).toLocaleDateString()}
              </div>
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" onClick={() => sendDraft(draft.id)}>Send</Button>
                <Button size="sm" variant="danger" onClick={() => deleteDraft(draft.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
