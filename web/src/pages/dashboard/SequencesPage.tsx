import { useState, useEffect } from "react";
import { api, post, del, patch } from "../../lib/api";
import { Badge, statusVariant, EmptyState, Table, PageHeader, Button, Input, Textarea, Modal, useConfirmDialog, useToast } from "../../components/ui";

interface Sequence {
  id: string;
  name: string;
  audience_id: string;
  from: string;
  status: string;
  trigger_type: string;
  steps?: Step[];
  created_at: string;
  updated_at: string;
}

interface Step {
  id: string;
  sequence_id: string;
  position: number;
  delay_minutes: number;
  subject?: string;
  html?: string;
  text?: string;
  template_id?: string;
  created_at: string;
}

interface Enrollment {
  id: string;
  contact_id: string;
  status: string;
  current_step: number;
  next_step_at?: string;
  enrolled_at: string;
  completed_at?: string;
}

interface Audience {
  id: string;
  name: string;
}

interface Domain {
  id: string;
  name: string;
  status: string;
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Sequence | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [form, setForm] = useState({ name: "", audience_id: "", from: "", trigger_type: "manual" });
  const [stepForm, setStepForm] = useState({ subject: "", html: "", text: "", delay_hours: "24" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const loadSequences = () => {
    api("/dashboard/sequences").then((r) => setSequences(r.data)).catch(() => {});
  };

  const loadSupporting = () => {
    api("/dashboard/audiences").then((r) => setAudiences(r.data)).catch(() => {});
    api("/dashboard/domains").then((r) => setDomains(r.data)).catch(() => {});
  };

  useEffect(() => { loadSequences(); loadSupporting(); }, []);

  const verifiedDomains = domains.filter((d) => d.status === "verified");

  const loadDetail = async (id: string) => {
    try {
      const r = await api(`/dashboard/sequences/${id}`);
      setDetail(r.data);
      const e = await api(`/dashboard/sequences/${id}/enrollments`);
      setEnrollments(e.data);
    } catch { showError("Failed to load sequence details"); }
  };

  const createSequence = async () => {
    setError(""); setCreating(true);
    try {
      await post("/dashboard/sequences", form);
      setCreateOpen(false);
      loadSequences();
    } catch (e: any) {
      setError(e?.error?.message || "Failed to create sequence");
    } finally { setCreating(false); }
  };

  const addStep = async () => {
    if (!detail) return;
    setError(""); setCreating(true);
    try {
      const stepsCount = detail.steps?.length || 0;
      await post(`/dashboard/sequences/${detail.id}/steps`, {
        position: stepsCount + 1,
        delay_minutes: parseInt(stepForm.delay_hours) * 60,
        subject: stepForm.subject || undefined,
        html: stepForm.html || undefined,
        text: stepForm.text || undefined,
      });
      setAddStepOpen(false);
      loadDetail(detail.id);
    } catch (e: any) {
      setError(e?.error?.message || "Failed to add step");
    } finally { setCreating(false); }
  };

  const toggleActivation = async (seq: Sequence) => {
    try {
      if (seq.status === "active") {
        await post(`/dashboard/sequences/${seq.id}/pause`, {});
      } else {
        await post(`/dashboard/sequences/${seq.id}/activate`, {});
      }
      loadSequences();
      if (detail?.id === seq.id) loadDetail(seq.id);
    } catch (e: any) {
      showError(e?.error?.message || "Failed to update sequence");
    }
  };

  const deleteSequence = (seq: Sequence) => {
    confirm({
      title: "Delete Sequence",
      message: `Delete "${seq.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await del(`/dashboard/sequences/${seq.id}`);
          if (detail?.id === seq.id) setDetail(null);
          loadSequences();
        } catch (e: any) { showError(e?.error?.message || "Failed to delete"); }
      },
    });
  };

  const deleteStep = (stepId: string) => {
    if (!detail) return;
    confirm({
      title: "Delete Step",
      message: "Remove this step from the sequence?",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await del(`/dashboard/sequences/${detail.id}/steps/${stepId}`);
          loadDetail(detail.id);
        } catch (e: any) { showError(e?.error?.message || "Failed to delete step"); }
      },
    });
  };

  const audienceName = (id: string) => audiences.find((a) => a.id === id)?.name || id.slice(0, 8);

  const formatDelay = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  // Detail view
  if (detail) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-white text-sm">&larr; Back</button>
          <h2 className="text-xl font-semibold text-white">{detail.name}</h2>
          <Badge variant={detail.status === "active" ? "success" : detail.status === "paused" ? "warning" : "default"}>{detail.status}</Badge>
          <div className="flex-1" />
          <Button size="sm" variant={detail.status === "active" ? "secondary" : "primary"} onClick={() => toggleActivation(detail)}>
            {detail.status === "active" ? "Pause" : "Activate"}
          </Button>
        </div>

        <div className="text-sm text-gray-400 mb-6 space-y-1">
          <div>Audience: {audienceName(detail.audience_id)}</div>
          <div>From: {detail.from}</div>
          <div>Trigger: {detail.trigger_type === "audience_join" ? "When contact joins audience" : "Manual enrollment"}</div>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-white">Steps</h3>
          {detail.status !== "active" && (
            <Button size="sm" onClick={() => { setStepForm({ subject: "", html: "", text: "", delay_hours: "24" }); setError(""); setAddStepOpen(true); }}>
              Add Step
            </Button>
          )}
        </div>

        {detail.steps && detail.steps.length > 0 ? (
          <div className="space-y-3 mb-8">
            {detail.steps.map((step, i) => (
              <div key={step.id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium">Step {step.position}</span>
                    <span className="text-gray-400 ml-3">{step.subject || "(no subject)"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">Wait {formatDelay(step.delay_minutes)}</span>
                    {detail.status !== "active" && (
                      <button onClick={() => deleteStep(step.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-sm mb-8">No steps yet. Add a step to get started.</div>
        )}

        {/* Enrollments */}
        <h3 className="text-lg font-medium text-white mb-3">Enrollments ({enrollments.length})</h3>
        {enrollments.length > 0 ? (
          <Table
            columns={["Contact", "Status", "Step", "Enrolled"]}
            rows={enrollments.map((e) => [
              e.contact_id.slice(0, 8) + "...",
              <Badge key="s" variant={statusVariant(e.status)}>{e.status}</Badge>,
              `${e.current_step}/${detail.steps?.length || "?"}`,
              new Date(e.enrolled_at).toLocaleDateString(),
            ])}
          />
        ) : (
          <div className="text-gray-500 text-sm">No contacts enrolled yet.</div>
        )}

        {/* Add Step Modal */}
        <Modal open={addStepOpen} onClose={() => setAddStepOpen(false)} title="Add Step">
          <div className="space-y-4">
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <Input label="Subject" value={stepForm.subject} onChange={(e) => setStepForm({ ...stepForm, subject: e.target.value })} />
            <Textarea label="HTML Body" value={stepForm.html} onChange={(e) => setStepForm({ ...stepForm, html: e.target.value })} rows={4} />
            <Textarea label="Text Body" value={stepForm.text} onChange={(e) => setStepForm({ ...stepForm, text: e.target.value })} rows={3} />
            <Input label="Delay (hours)" type="number" value={stepForm.delay_hours} onChange={(e) => setStepForm({ ...stepForm, delay_hours: e.target.value })} />
            <Button onClick={addStep} disabled={creating} className="w-full">{creating ? "Adding..." : "Add Step"}</Button>
          </div>
        </Modal>

        {confirmDialog}
        {toast}
      </div>
    );
  }

  // List view
  return (
    <div>
      <PageHeader title="Sequences" description="Automated multi-step email flows">
        <Button onClick={() => { setForm({ name: "", audience_id: "", from: "", trigger_type: "manual" }); setError(""); setCreateOpen(true); }}>
          Create Sequence
        </Button>
      </PageHeader>

      {sequences.length === 0 ? (
        <EmptyState title="No sequences yet" desc="Sequences send a series of emails to a contact over time — onboarding, drip nurturing, re-engagement. Create one to start." />
      ) : (
        <Table
          columns={["Name", "Audience", "Status", "Trigger", "Created"]}
          rows={sequences.map((s) => [
            <button key="n" onClick={() => loadDetail(s.id)} className="text-blue-400 hover:text-blue-300 font-medium">{s.name}</button>,
            audienceName(s.audience_id),
            <Badge key="s" variant={statusVariant(s.status)}>{s.status}</Badge>,
            s.trigger_type === "audience_join" ? "Auto" : "Manual",
            new Date(s.created_at).toLocaleDateString(),
          ])}
          actions={sequences.map((s) => (
            <div key={s.id} className="flex gap-2">
              <button onClick={() => toggleActivation(s)} className="text-xs text-gray-400 hover:text-white">
                {s.status === "active" ? "Pause" : "Activate"}
              </button>
              <button onClick={() => deleteSequence(s)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          ))}
        />
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Sequence">
        <div className="space-y-4">
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <Input label="Name" placeholder="Welcome Series" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Audience</label>
            <select className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white" value={form.audience_id} onChange={(e) => setForm({ ...form, audience_id: e.target.value })}>
              <option value="">Select audience</option>
              {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">From Address</label>
            <select className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
              <option value="">Select domain</option>
              {verifiedDomains.map((d) => <option key={d.id} value={`noreply@${d.name}`}>noreply@{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Trigger</label>
            <select className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white" value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}>
              <option value="manual">Manual enrollment</option>
              <option value="audience_join">When contact joins audience</option>
            </select>
          </div>
          <Button onClick={createSequence} disabled={creating || !form.name || !form.audience_id || !form.from} className="w-full">
            {creating ? "Creating..." : "Create Sequence"}
          </Button>
        </div>
      </Modal>

      {confirmDialog}
      {toast}
    </div>
  );
}
