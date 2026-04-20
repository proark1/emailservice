import { useState, useEffect } from "react";
import { api, post } from "../../lib/api";
import { PageHeader, Button, Badge, Table, EmptyState, Modal, useToast } from "../../components/ui";

type Domain = {
  id: string;
  name: string;
  status: string;
  mode: string;
  company_id?: string | null;
};

type Group = {
  company_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  domains: Domain[];
};

type Company = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export default function CompaniesPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [totalDomains, setTotalDomains] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [working, setWorking] = useState(false);
  const { showError, toast } = useToast();

  const loadData = async () => {
    try {
      const [g, c] = await Promise.all([
        api<{ data: { groups: Group[]; total_domains: number; unlinked_count: number } }>("/dashboard/domain-groups"),
        api<{ data: Company[] }>("/dashboard/companies"),
      ]);
      setGroups(g.data.groups);
      setTotalDomains(g.data.total_domains);
      setUnlinkedCount(g.data.unlinked_count);
      setCompanies(c.data);
      if (c.data.length > 0) setTargetCompanyId((prev) => prev || c.data[0].id);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleSelect = (domainId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  };

  const adoptSelected = async () => {
    if (!targetCompanyId || selected.size === 0) return;
    setWorking(true);
    try {
      const res = await post<{ data: { linked: number; skipped: number; errored: number } }>(
        `/dashboard/companies/${targetCompanyId}/adopt-domains`,
        { domain_ids: Array.from(selected) },
      );
      const { linked, skipped, errored } = res.data;
      if (errored > 0) {
        showError(`Adopted ${linked}; skipped ${skipped}; ${errored} failed — see API for details.`);
      }
      setSelected(new Set());
      setAdoptOpen(false);
      loadData();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const statusVariant = (s: string): "success" | "warning" | "danger" | "default" => {
    if (s === "verified") return "success";
    if (s === "pending") return "warning";
    if (s === "failed") return "danger";
    return "default";
  };

  return (
    <div>
      <PageHeader
        title="Companies"
        desc={`${companies.length} companies · ${totalDomains} domains · ${unlinkedCount} stranded on master account`}
        action={
          unlinkedCount > 0 && companies.length > 0 ? (
            <Button onClick={() => setAdoptOpen(true)} disabled={selected.size === 0}>
              Adopt {selected.size > 0 ? `${selected.size} domain${selected.size === 1 ? "" : "s"}` : "Selected"}
            </Button>
          ) : null
        }
      />

      <Modal open={adoptOpen} onClose={() => setAdoptOpen(false)} title="Move domains into company">
        <div className="space-y-3">
          <p className="text-[13px] text-gray-600 dark:text-gray-400">
            Moving {selected.size} domain{selected.size === 1 ? "" : "s"} into a company will scope future
            sends to that company's API keys. Existing sends are unaffected.
          </p>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">Target company</label>
            <select
              value={targetCompanyId}
              onChange={(e) => setTargetCompanyId(e.target.value)}
              className="w-full h-10 px-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAdoptOpen(false)}>Cancel</Button>
            <Button onClick={adoptSelected} disabled={working || !targetCompanyId}>
              {working ? "Moving..." : "Move domains"}
            </Button>
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : groups.length === 0 ? (
        <EmptyState title="No domains" description="Add a domain to get started." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const isUnlinked = g.company_id === null;
            return (
              <div key={g.company_id ?? "unlinked"}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
                    {isUnlinked ? "Unlinked (stranded on master account)" : g.company_name}
                  </h3>
                  {!isUnlinked && g.company_slug && (
                    <code className="text-[11px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {g.company_slug}
                    </code>
                  )}
                  <Badge variant={isUnlinked ? "warning" : "default"}>{g.domains.length} domain{g.domains.length === 1 ? "" : "s"}</Badge>
                </div>
                {isUnlinked && (
                  <p className="text-[12px] text-gray-500 mb-2">
                    Select the domains you want to move into a company, then click "Adopt" above.
                    Domains stay stranded here until adopted.
                  </p>
                )}
                <Table headers={isUnlinked ? ["", "Domain", "Status", "Mode"] : ["Domain", "Status", "Mode"]}>
                  {g.domains.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      {isUnlinked && (
                        <td className="px-4 py-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={selected.has(d.id)}
                            onChange={() => toggleSelect(d.id)}
                            className="rounded"
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-mono">{d.name}</td>
                      <td className="px-4 py-2.5"><Badge variant={statusVariant(d.status)}>{d.status}</Badge></td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{d.mode}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            );
          })}
        </div>
      )}

      {toast}
    </div>
  );
}
