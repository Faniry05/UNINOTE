import { useCallback, useEffect, useState } from 'react';
import { Banknote, RefreshCw, Search, AlertCircle } from 'lucide-react';
import { transactionsService } from '../api/transactions.service';
import type { ServiceTransaction } from '../types/scolarite';
import { formatAriary, formatDateTime } from '../utils/format';
import { PaymentStatusBadge, TransactionStatusBadge } from './StatusBadge';

export function AgentHistoryPage() {
  const [transactions, setTransactions] = useState<ServiceTransaction[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMyTransactions = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await transactionsService.getTransactions({
        search: query !== undefined ? query : search,
      });
      setTransactions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement de vos opérations.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadMyTransactions('');
  }, []);

  async function handleConfirmPayment(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await transactionsService.confirmPayment(id);
      await loadMyTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de confirmer le paiement.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">Historique guichet</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Mes opérations</h1>
          <p className="text-sm text-slate-600 mt-1">
            Liste strictement limitée aux prestations que vous avez enregistrées.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadMyTransactions()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 self-start cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadMyTransactions();
            }}
            placeholder="Rechercher par référence, matricule ou nom étudiant..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => loadMyTransactions()}
          className="rounded-xl bg-[#332E86] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28246b] cursor-pointer"
        >
          Filtrer
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement de vos opérations...</div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Aucune opération trouvée pour votre compte guichet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Matricule</th>
                  <th className="py-3 px-4">Étudiant</th>
                  <th className="py-3 px-4">Prestation</th>
                  <th className="py-3 px-4 text-right">Tarif appliqué</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-ref text-xs font-semibold text-[#332E86] whitespace-nowrap">
                      {tx.reference}
                    </td>
                    <td className="py-3 px-4 font-mono-ref text-xs text-slate-700 whitespace-nowrap">
                      {tx.studentMatricule}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {tx.studentNom} {tx.studentPrenom}
                      </div>
                      <div className="text-xs text-slate-500">{tx.studentPromotion}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-800">{tx.serviceName}</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatAriary(tx.priceAtTransaction)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        <TransactionStatusBadge status={tx.status} />
                        <PaymentStatusBadge paymentStatus={tx.paymentStatus} />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {tx.status === 'PENDING' && tx.paymentStatus === 'UNPAID' ? (
                        <button
                          type="button"
                          disabled={busyId === tx.id}
                          onClick={() => handleConfirmPayment(tx.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#332E86] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          {busyId === tx.id ? '...' : 'Encaisser'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
