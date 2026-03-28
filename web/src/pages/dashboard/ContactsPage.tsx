import { useState, useEffect, useMemo } from "react";
import { api, post, patch, del } from "../../lib/api";
import { PageHeader, Button, Modal, Input, Textarea, Table, EmptyState, useConfirmDialog, useToast } from "../../components/ui";

interface Contact {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState({ email: "", name: "", company: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const loadContacts = async () => {
    try {
      const res = await api<{ data: Contact[] }>("/dashboard/address-book");
      setContacts(res.data);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContacts(); }, []);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) =>
      c.email.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const openCreate = () => {
    setEditContact(null);
    setForm({ email: "", name: "", company: "", notes: "" });
    setModalOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditContact(contact);
    setForm({
      email: contact.email,
      name: contact.name || "",
      company: contact.company || "",
      notes: contact.notes || "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: any = { email: form.email };
      if (form.name) body.name = form.name;
      if (form.company) body.company = form.company;
      if (form.notes) body.notes = form.notes;

      if (editContact) {
        await patch(`/dashboard/address-book/${editContact.id}`, body);
      } else {
        await post("/dashboard/address-book", body);
      }
      setModalOpen(false);
      loadContacts();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = (contact: Contact) => {
    confirm({
      title: "Delete Contact",
      message: `Remove ${contact.email} from your address book?`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await del(`/dashboard/address-book/${contact.id}`);
          loadContacts();
        } catch (err: any) {
          showError(err.message);
        }
      },
    });
  };

  return (
    <div>
      <PageHeader title="Contacts" desc="Personal address book" action={<Button onClick={openCreate}>+ Add Contact</Button>} />

      <div className="px-4 pb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="w-full max-w-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editContact ? "Edit Contact" : "Add Contact"}>
        <div className="space-y-3">
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          <Input label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.email}>{saving ? "Saving..." : editContact ? "Update" : "Add"}</Button>
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No matches" : "No contacts"}
          description={search ? "Try a different search term." : "Add contacts to your address book for quick email composition."}
          action={!search ? <Button onClick={openCreate}>+ Add Contact</Button> : undefined}
        />
      ) : (
        <Table headers={["Email", "Name", "Company", "Added", ""]}>
          {filtered.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => openEdit(c)}>
              <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">{c.email}</td>
              <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">{c.name || "-"}</td>
              <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">{c.company || "-"}</td>
              <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="danger" onClick={() => deleteContact(c)}>Delete</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {confirmDialog}
      {toast}
    </div>
  );
}
