import { useState, useEffect, useMemo } from "react";
import { api, post, patch, del } from "../../lib/api";
import {
  Badge,
  EmptyState,
  Table,
  PageHeader,
  Button,
  Input,
  Textarea,
  Modal,
  useConfirmDialog,
  useToast,
} from "../../components/ui";
import { RichEditor, wrapEmailHtml } from "../../components/RichEditor";

/* ---------- types ---------- */

type Template = {
  id: string;
  name: string;
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  variables: string[];
  version: number;
  created_at: string;
  updated_at: string;
};

/* ---------- helpers ---------- */

function extractVariables(text: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/* ---------- main component ---------- */

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", subject: "", html: "", text: "" });
  const [showText, setShowText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, showSuccess, toast } = useToast();

  /* --- data loading --- */

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Template[] }>("/dashboard/templates");
      setTemplates(res.data);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  /* --- detected variables --- */

  const detectedVars = useMemo(() => {
    const allText = [form.subject, form.html, form.text].join(" ");
    return extractVariables(allText);
  }, [form.subject, form.html, form.text]);

  /* --- create --- */

  const resetForm = () => {
    setForm({ name: "", subject: "", html: "", text: "" });
    setShowText(false);
    setError("");
  };

  const handleCreate = async () => {
    setError("");
    setSaving(true);
    try {
      await post("/dashboard/templates", {
        name: form.name,
        subject: form.subject || undefined,
        html: form.html || undefined,
        text: form.text || undefined,
      });
      setCreateOpen(false);
      resetForm();
      showSuccess("Template created");
      loadTemplates();
    } catch (e: any) {
      setError(e.message || "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  /* --- edit --- */

  const openEdit = (t: Template) => {
    setEditTemplate(t);
    setForm({
      name: t.name,
      subject: t.subject || "",
      html: t.html_body || "",
      text: t.text_body || "",
    });
    setShowText(!!(t.text_body));
    setError("");
  };

  const handleUpdate = async () => {
    if (!editTemplate) return;
    setError("");
    setSaving(true);
    try {
      await patch(`/dashboard/templates/${editTemplate.id}`, {
        name: form.name,
        subject: form.subject || undefined,
        html: form.html || undefined,
        text: form.text || undefined,
      });
      setEditTemplate(null);
      resetForm();
      showSuccess("Template saved");
      loadTemplates();
    } catch (e: any) {
      setError(e.message || "Failed to update template");
    } finally {
      setSaving(false);
    }
  };

  /* --- delete --- */

  const handleDelete = (id: string) => {
    confirm({
      title: "Delete this template?",
      message: "This template will be permanently removed.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await del(`/dashboard/templates/${id}`);
          loadTemplates();
        } catch (e: any) {
          showError(e.message || "Failed to delete template");
        }
      },
    });
  };

  /* --- preview --- */

  const getPreviewHtml = (t: Template): string => {
    let html = t.html_body || t.text_body || "";
    // Replace variables with sample values
    html = html.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
      const samples: Record<string, string> = {
        first_name: "Jane",
        last_name: "Doe",
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme Inc",
        unsubscribe_url: "#",
      };
      return `<span style="background:#e0e7ff;padding:1px 4px;border-radius:3px;font-weight:600">${samples[name] || name}</span>`;
    });
    return html;
  };

  /* ---------- render ---------- */

  const isModalOpen = createOpen || !!editTemplate;
  const modalTitle = editTemplate ? "Edit Template" : "Create Template";

  return (
    <div>
      <PageHeader
        title="Templates"
        desc="Create and manage reusable email templates"
        action={
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Template
          </Button>
        }
      />

      {/* Template list */}
      {loading && templates.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          desc="Create a template to reuse email content with variables"
          action={<Button onClick={() => { resetForm(); setCreateOpen(true); }}>Create Template</Button>}
        />
      ) : (
        <Table headers={["Name", "Subject", "Variables", "Version", "Last Updated", "Actions"]}>
          {templates.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium">{t.name}</td>
              <td className="px-4 py-3 text-gray-600 text-[13px] max-w-[250px] truncate">{t.subject || "\u2014"}</td>
              <td className="px-4 py-3">
                {t.variables.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {t.variables.slice(0, 3).map((v) => (
                      <Badge key={v} variant="default">{v}</Badge>
                    ))}
                    {t.variables.length > 3 && (
                      <span className="text-[11px] text-gray-400">+{t.variables.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-gray-400">None</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 text-[13px] tabular-nums">v{t.version}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px] whitespace-nowrap">{formatDate(t.updated_at)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button
                    onClick={() => setPreviewTemplate(t)}
                    className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    className="px-2 py-1 text-[12px] text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={isModalOpen}
        onClose={() => { setCreateOpen(false); setEditTemplate(null); setError(""); }}
        title={modalTitle}
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px] flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          <Input
            label="Template Name"
            placeholder="e.g. Welcome Email"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: (e.target as HTMLInputElement).value })}
          />

          <Input
            label="Subject"
            placeholder="e.g. Welcome to {{company}}, {{first_name}}!"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: (e.target as HTMLInputElement).value })}
          />

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">HTML Body</label>
            <RichEditor
              value={form.html}
              onChange={(html) => setForm({ ...form, html })}
              placeholder="Write your template content... Use {{variable_name}} for dynamic values"
              minHeight="160px"
            />
          </div>

          {!showText ? (
            <button
              type="button"
              onClick={() => setShowText(true)}
              className="text-[12px] text-violet-600 hover:text-violet-700 font-medium transition-colors cursor-pointer"
            >
              + Add plain text version
            </button>
          ) : (
            <Textarea
              label="Plain Text Body"
              placeholder="Plain text version of the template..."
              value={form.text}
              onChange={(e) => setForm({ ...form, text: (e.target as HTMLTextAreaElement).value })}
              rows={4}
            />
          )}

          {/* Detected variables */}
          {detectedVars.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                Detected Variables ({detectedVars.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detectedVars.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Button
              onClick={editTemplate ? handleUpdate : handleCreate}
              disabled={saving || !form.name}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : editTemplate ? (
                "Update Template"
              ) : (
                "Create Template"
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setCreateOpen(false); setEditTemplate(null); setError(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview modal */}
      <Modal
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        title={`Preview: ${previewTemplate?.name || ""}`}
      >
        {previewTemplate && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Subject preview */}
            {previewTemplate.subject && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
                <p className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-1">Subject</p>
                <p className="text-[13px] text-gray-900">
                  {previewTemplate.subject.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
                    const samples: Record<string, string> = {
                      first_name: "Jane", last_name: "Doe", name: "Jane Doe",
                      email: "jane@example.com", company: "Acme Inc",
                    };
                    return samples[name] || name;
                  })}
                </p>
              </div>
            )}

            {/* Variables legend */}
            {previewTemplate.variables.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Variables (sample data)</p>
                <div className="flex flex-wrap gap-1.5">
                  {previewTemplate.variables.map((v) => (
                    <Badge key={v} variant="default">{`{{${v}}}`}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* HTML preview */}
            {previewTemplate.html_body && (
              <div>
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Body</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <iframe
                    sandbox=""
                    srcDoc={getPreviewHtml(previewTemplate)}
                    title="Template preview"
                    className="w-full h-64 border-0"
                  />
                </div>
              </div>
            )}

            {/* Text fallback */}
            {!previewTemplate.html_body && previewTemplate.text_body && (
              <div>
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Body (plain text)</p>
                <pre className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-[13px] text-gray-700 whitespace-pre-wrap font-mono">
                  {previewTemplate.text_body.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
                    const samples: Record<string, string> = {
                      first_name: "Jane", last_name: "Doe", name: "Jane Doe",
                      email: "jane@example.com", company: "Acme Inc",
                    };
                    return samples[name] || name;
                  })}
                </pre>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setPreviewTemplate(null)}>Close</Button>
              <Button onClick={() => { setPreviewTemplate(null); openEdit(previewTemplate); }}>Edit Template</Button>
            </div>
          </div>
        )}
      </Modal>
      {confirmDialog}
      {toast}
    </div>
  );
}
