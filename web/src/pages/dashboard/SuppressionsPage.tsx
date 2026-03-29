import { useState, useEffect, useMemo } from "react";
import { useToast } from "../../components/Toast";
import { api, post, del } from "../../lib/api";
import { PageHeader, Button, Input, Table, Modal, EmptyState, Badge } from "../../components/ui";

interface Suppression {
  id: string;
  email: string;
  reason: string;
  created_at: string;
}

const reasonVariant = (r: string): "error" | "warning" | "default" | "success" => {
  if (r === "bounce") return "error";
  if (r === "complaint") return "warning";
  if (r === "unsubscribe") return "default";
  return "success";
};

export default function SuppressionsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addReason, setAddReason] = useState<string>("manual");
  const [adding, setAdding] = useState(false);

  // Remove confirmation state
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api("/dashboard/suppressions");
      setItems(res.data);
    } catch {
      toast("Failed to load suppressions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((s) => s.email.toLowerCase().includes(q));
  }, [items, search]);

  const handleAdd = async () => {
    if (!addEmail.trim()) {
      toast("Email is required", "error");
      return;
    }
    setAdding(true);
    try {
      await post("/dashboard/suppressions", { email: addEmail.trim(), reason: addReason });
      toast("Suppression added");
      setAddOpen(false);
      setAddEmail("");
      setAddReason("manual");
      load();
    } catch (err: any) {
      toast(err.message || "Failed to add suppression", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!removeId) return;
    setRemoving(true);
    try {
      await del(`/dashboard/suppressions/${removeId}`);
      toast("Suppression removed");
      setRemoveId(null);
      load();
    } catch (err: any) {
      toast(err.message || "Failed to remove suppression", "error");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suppressions"
        desc="Email addresses that are blocked from receiving emails."
        action={<Button onClick={() => setAddOpen(true)}>Add Suppression</Button>}
      />

      <div className="mb-4 max-w-sm">
        <Input
          label=""
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No matching suppressions" : "No suppressions"}
          desc={search ? "Try a different search term." : "Suppressed addresses will appear here when added manually or from bounces/complaints."}
        />
      ) : (
        <Table headers={["Email", "Reason", "Date Added", "Actions"]}>
          {filtered.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-[13px] text-gray-900 font-mono">{s.email}</td>
              <td className="px-4 py-3"><Badge variant={reasonVariant(s.reason)}>{s.reason}</Badge></td>
              <td className="px-4 py-3 text-[13px] text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <Button variant="danger" onClick={() => setRemoveId(s.id)}>Remove</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* Add Suppression Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Suppression">
        <div className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="user@example.com"
          />
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Reason</label>
            <select
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              className="w-full h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
            >
              <option value="manual">Manual</option>
              <option value="bounce">Bounce</option>
              <option value="complaint">Complaint</option>
              <option value="unsubscribe">Unsubscribe</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding}>{adding ? "Adding..." : "Add"}</Button>
          </div>
        </div>
      </Modal>

      {/* Remove Confirmation Modal */}
      <Modal open={!!removeId} onClose={() => setRemoveId(null)} title="Remove Suppression">
        <p className="text-[13px] text-gray-600 mb-5">
          Are you sure you want to remove this suppression? The email address will be able to receive emails again.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRemoveId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleRemove} disabled={removing}>
            {removing ? "Removing..." : "Remove"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
