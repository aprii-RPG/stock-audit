import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCheck, Search } from 'lucide-react';
import type { Audit, AuditItem, Store, User } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';

interface ExactMatchProductsViewProps {
  audits: Audit[];
  items: AuditItem[];
  stores: Store[];
  users: User[];
  onSendToRecount: (
    auditId: string,
    productId: string,
    recountAssigneeId: string,
    note?: string
  ) => Promise<void>;
  onOpenAudit: (auditId: string) => void;
}

export const ExactMatchProductsView: React.FC<ExactMatchProductsViewProps> = ({
  audits,
  items,
  stores,
  users,
  onSendToRecount,
  onOpenAudit,
}) => {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [assigneeId, setAssigneeId] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const auditById = useMemo(() => new Map(audits.map((audit) => [audit.id, audit])), [audits]);
  const allExactMatches = useMemo(() => {
    return items.flatMap((item) => {
      if (item.physicalCount === undefined || calculateAuditDiscrepancy(item).difference !== 0) {
        return [];
      }
      const audit = auditById.get(item.auditId);
      return audit ? [{ item, audit }] : [];
    }).sort((a, b) =>
      a.audit.storeName.localeCompare(b.audit.storeName) ||
      a.audit.date.localeCompare(b.audit.date) ||
      a.item.product.name.localeCompare(b.item.product.name)
    );
  }, [items, auditById]);
  const exactMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allExactMatches.filter(({ item, audit }) => {
      if (storeFilter !== 'ALL' && audit.storeId !== storeFilter) return false;
      if (
        query &&
        !item.product.name.toLowerCase().includes(query) &&
        !item.product.code.toLowerCase().includes(query) &&
        !audit.name.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [allExactMatches, storeFilter, search]);

  const selectedMatches = allExactMatches.filter(({ item }) => selectedItemIds.includes(item.id));
  const selectedAuditorIds = new Set(
    selectedMatches.map(({ item }) => item.countedByUserId).filter(Boolean)
  );
  const eligibleAssignees = users.filter(
    (user) =>
      user.role === 'auditor' &&
      !selectedAuditorIds.has(user.id) &&
      selectedMatches.every(({ audit }) => audit.status === 'in_progress')
  );
  const dispatchableSelected = selectedMatches.filter(({ audit }) => audit.status === 'in_progress');

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
    setError(null);
    setSuccess(null);
  };

  const handleDispatch = async () => {
    if (!assigneeId || selectedMatches.length === 0) {
      setError('Select at least one product and a recount auditor.');
      return;
    }
    if (dispatchableSelected.length !== selectedMatches.length) {
      setError('Only products in in-progress audits can be dispatched for recount.');
      return;
    }
    if (selectedAuditorIds.has(assigneeId)) {
      setError('The recount auditor must be different from every selected product’s original counter.');
      return;
    }

    setIsDispatching(true);
    setError(null);
    setSuccess(null);
    let dispatchedCount = 0;
    try {
      for (const { item, audit } of selectedMatches) {
        await onSendToRecount(
          audit.id,
          item.productId,
          assigneeId,
          'Recount requested for a previously exact-match product.'
        );
        dispatchedCount += 1;
        setSelectedItemIds((current) => current.filter((id) => id !== item.id));
      }
      const auditId = selectedMatches[0].audit.id;
      setSelectedItemIds([]);
      setSuccess(`${dispatchedCount} product(s) sent for recount. Recount results will appear in Audits & Review.`);
      onOpenAudit(auditId);
    } catch (dispatchError) {
      setError(
        `${dispatchedCount} product(s) were dispatched before an error: ${
          dispatchError instanceof Error ? dispatchError.message : String(dispatchError)
        }`
      );
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="rounded-2xl border border-blue-100 bg-white p-4 shadow-xs">
        <h2 className="text-xl font-black tracking-tight text-[#0B3D91]">
          Exact Match Products
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Products with a submitted physical count equal to the expected stock quantity, across all audits.
          Select products from in-progress audits to request a recount.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, code, or audit..."
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm"
              aria-label="Search exact match products"
            />
          </div>
          <select
            value={storeFilter}
            onChange={(event) => setStoreFilter(event.target.value)}
            aria-label="Filter exact match products by branch"
            className="min-h-[42px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"
          >
            <option value="ALL">All Branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.code ? `${store.code} - ` : ''}{store.name}
              </option>
            ))}
          </select>
        </div>

        {selectedItemIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <span className="text-sm font-bold text-[#0B3D91]">
              {selectedItemIds.length} selected
            </span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              aria-label="Select recount auditor"
              className="min-h-[40px] min-w-[210px] rounded-lg border border-blue-200 bg-white px-3 text-sm"
            >
              <option value="">Select recount auditor</option>
              {eligibleAssignees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.employeeId})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDispatch}
              disabled={isDispatching || dispatchableSelected.length !== selectedMatches.length}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#1D5FD1] px-3 py-2 text-sm font-bold text-white hover:bg-[#0B3D91] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              {isDispatching ? 'Dispatching...' : 'Send Selected for Recount'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedItemIds([]);
                setAssigneeId('');
              }}
              disabled={isDispatching}
              className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-white"
            >
              Clear
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {success}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-[#F7FAFF] text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all exact match products from in-progress audits"
                    checked={dispatchableSelected.length > 0 && dispatchableSelected.length === exactMatches.filter(({ audit }) => audit.status === 'in_progress').length}
                    onChange={(event) => {
                      const dispatchableIds = exactMatches
                        .filter(({ audit }) => audit.status === 'in_progress')
                        .map(({ item }) => item.id);
                      setSelectedItemIds(event.target.checked ? dispatchableIds : []);
                    }}
                    className="rounded border-slate-300 text-[#1D5FD1]"
                  />
                </th>
                <th className="px-3 py-3">Branch</th>
                <th className="px-3 py-3">Audit</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Bin</th>
                <th className="px-3 py-3 text-right">Expected</th>
                <th className="px-3 py-3 text-right">Physical</th>
                <th className="px-3 py-3">Counted By</th>
                <th className="px-3 py-3">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exactMatches.map(({ item, audit }) => {
                const isSelectable = audit.status === 'in_progress' && item.status !== 'recount';
                return (
                  <tr key={item.id} className="text-slate-700 hover:bg-blue-50/40">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(item.id)}
                        disabled={!isSelectable || isDispatching}
                        onChange={() => toggleItem(item.id)}
                        aria-label={`Select ${item.product.name} for recount`}
                        className="rounded border-slate-300 text-[#1D5FD1] disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-3 font-semibold">{audit.storeName}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenAudit(audit.id)}
                        className="text-left font-semibold text-[#1D5FD1] hover:underline"
                      >
                        {audit.name}
                      </button>
                      <span className="block text-xs text-slate-500">{audit.date}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-bold text-slate-900">{item.product.name}</span>
                      <span className="block font-mono text-xs text-slate-500">{item.product.code}</span>
                    </td>
                    <td className="px-3 py-3">{item.bin || '—'}</td>
                    <td className="px-3 py-3 text-right font-mono">{calculateAuditDiscrepancy(item).expectedQty}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">{item.physicalCount}</td>
                    <td className="px-3 py-3">{item.countedByUserName || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                        audit.status === 'in_progress'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {audit.status.replace(/_/g, ' ')}
                      </span>
                      {!isSelectable && audit.status === 'in_progress' && item.status === 'recount' && (
                        <span className="ml-1 text-xs text-slate-500">recount pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {exactMatches.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                    No exact-match products found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
