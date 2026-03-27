import { useState, useEffect, useMemo } from "react";
import { api, post, patch, del } from "../../lib/api";
import { Badge, EmptyState, Table, PageHeader, Button, Input, Modal } from "../../components/ui";

interface Audience {
  id: string;
  name: string;
  contactCount?: number;
  createdAt: string;
}

interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subscribed: boolean;
  createdAt: string;
}

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<Audience | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadAudiences = () => {
    api("/dashboard/audiences").then((r) => setAudiences(r.data)).catch(() => {});
  };

  useEffect(() => { loadAudiences(); }, []);

  const createAudience = async () => {
    setError(""); setCreating(true);
    try {
      await post("/dashboard/audiences", { name: createName });
      setCreateOpen(false);
      setCreateName("");
      loadAudiences();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const deleteAudience = async (id: string) => {
    if (!window.confirm("Delete this audience and all its contacts?")) return;
    try { await del(`/dashboard/audiences/${id}`); } catch (e: any) { alert(e.message || "Delete failed"); }
    loadAudiences();
  };

  if (selectedAudience) {
    return (
      <AudienceDetail
        audience={selectedAudience}
        onBack={() => { setSelectedAudience(null); loadAudiences(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Audiences" desc="Manage contact lists for broadcasts" action={<Button onClick={() => setCreateOpen(true)}>+ Create Audience</Button>} />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Audience">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Audience name" placeholder="e.g. Newsletter subscribers" value={createName} onChange={(e) => setCreateName((e.target as HTMLInputElement).value)} />
          <Button onClick={createAudience} disabled={creating || !createName.trim()}>{creating ? "Creating..." : "Create Audience"}</Button>
        </div>
      </Modal>

      {audiences.length === 0 ? (
        <EmptyState title="No audiences yet" desc="Create an audience to start collecting contacts" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {audiences.map((a) => (
            <div key={a.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-gray-900 truncate">{a.name}</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAudience(a.id); }}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2"
                  title="Delete audience"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-gray-500 mb-4">
                <span>{a.contactCount ?? 0} contacts</span>
                <span>Created {new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-auto">
                <Button variant="secondary" onClick={() => setSelectedAudience(a)}>View Contacts</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AudienceDetail({ audience, onBack }: { audience: Audience; onBack: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", first_name: "", last_name: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", subscribed: true });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  const loadContacts = () => {
    api(`/dashboard/audiences/${audience.id}/contacts`).then((r) => setContacts(r.data)).catch(() => {});
  };

  useEffect(() => { loadContacts(); }, [audience.id]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.firstName && c.firstName.toLowerCase().includes(q)) ||
        (c.lastName && c.lastName.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const addContact = async () => {
    setError(""); setAdding(true);
    try {
      await post(`/dashboard/audiences/${audience.id}/contacts`, addForm);
      setAddOpen(false);
      setAddForm({ email: "", first_name: "", last_name: "" });
      loadContacts();
    } catch (e: any) { setError(e.message); }
    finally { setAdding(false); }
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setEditForm({ first_name: c.firstName || "", last_name: c.lastName || "", subscribed: c.subscribed });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editContact) return;
    setEditError(""); setEditing(true);
    try {
      await patch(`/dashboard/audiences/${audience.id}/contacts/${editContact.id}`, editForm);
      setEditContact(null);
      loadContacts();
    } catch (e: any) { setEditError(e.message); }
    finally { setEditing(false); }
  };

  const deleteContact = async (contactId: string) => {
    if (!window.confirm("Remove this contact?")) return;
    try { await del(`/dashboard/audiences/${audience.id}/contacts/${contactId}`); } catch (e: any) { alert(e.message || "Delete failed"); }
    loadContacts();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{audience.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Add Contact</Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search contacts by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
        />
      </div>

      {/* Add Contact Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Contact">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Email" placeholder="contact@example.com" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: (e.target as HTMLInputElement).value })} />
          <Input label="First name" placeholder="Jane" value={addForm.first_name} onChange={(e) => setAddForm({ ...addForm, first_name: (e.target as HTMLInputElement).value })} />
          <Input label="Last name" placeholder="Doe" value={addForm.last_name} onChange={(e) => setAddForm({ ...addForm, last_name: (e.target as HTMLInputElement).value })} />
          <Button onClick={addContact} disabled={adding || !addForm.email.trim()}>{adding ? "Adding..." : "Add Contact"}</Button>
        </div>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal open={!!editContact} onClose={() => setEditContact(null)} title="Edit Contact">
        {editError && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{editError}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Email</label>
            <p className="text-[13px] text-gray-500">{editContact?.email}</p>
          </div>
          <Input label="First name" placeholder="Jane" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: (e.target as HTMLInputElement).value })} />
          <Input label="Last name" placeholder="Doe" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: (e.target as HTMLInputElement).value })} />
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Subscription status</label>
            <button
              onClick={() => setEditForm({ ...editForm, subscribed: !editForm.subscribed })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.subscribed ? "bg-violet-600" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${editForm.subscribed ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="ml-2 text-[13px] text-gray-500">{editForm.subscribed ? "Subscribed" : "Unsubscribed"}</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveEdit} disabled={editing}>{editing ? "Saving..." : "Save Changes"}</Button>
            <Button variant="secondary" onClick={() => setEditContact(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" desc="Add contacts to this audience to start sending broadcasts" />
      ) : filteredContacts.length === 0 ? (
        <EmptyState title="No matches" desc="No contacts match your search" />
      ) : (
        <Table headers={["Email", "First Name", "Last Name", "Status", "Actions"]}>
          {filteredContacts.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium">{c.email}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{c.firstName || "—"}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{c.lastName || "—"}</td>
              <td className="px-4 py-3">
                <Badge variant={c.subscribed ? "success" : "default"}>{c.subscribed ? "Subscribed" : "Unsubscribed"}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(c)} className="text-[12px] text-violet-600 hover:text-violet-700 font-medium transition-colors">Edit</button>
                  <button onClick={() => deleteContact(c.id)} className="text-[12px] text-red-500 hover:text-red-600 font-medium transition-colors">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
