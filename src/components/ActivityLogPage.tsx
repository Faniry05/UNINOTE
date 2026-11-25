import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, AlertCircle } from 'lucide-react';
import { activityLogService } from '../api/activity-log.service';
import type { ActivityLogEntry } from '../types/scolarite';
import { formatDateTime } from '../utils/format';

const ACTION_LABELS: Record<string, string> = {
  TRANSACTION_CREATED: 'Transaction créée',
  TRANSACTION_PAYMENT_CONFIRMED: 'Encaissement confirmé',
  TRANSACTION_CANCELLED: 'Transaction annulée',
  TRANSACTION_CORRECTED: 'Transaction corrigée',
  SERVICE_CREATED: 'Service créé',
  SERVICE_UPDATED: 'Service modifié',
  SERVICE_PRICE_CHANGED: 'Tarif modifié',
  STUDENT_CREATED: 'Étudiant enregistré',
  GRADE_RECORDED: 'Note académique saisie',
  USER_CREATED: 'Compte utilisateur créé',
  USER_STATUS_CHANGED: 'Statut utilisateur modifié',
};

export function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await activityLogService.getActivityHistory({
        entityType: entityFilter !== 'ALL' ? entityFilter : undefined,
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
        limit: 150,
      });
      setLogs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du journal d’audit.');
    } finally {
      setLoading(false);
    }
  }, [entityFilter, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">Traçabilité &amp; Contrôle</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Journal d’audit</h1>
          <p className="text-sm text-slate-600 mt-1">
            Historique infalsifiable des opérations guichet, modifications tarifaires, annulations et corrections.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadLogs()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 self-start cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="log-entity">
            Type d’entité
          </label>
          <select
            id="log-entity"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
          >
            <option value="ALL">Toutes les entités</option>
            <option value="SERVICE_TRANSACTION">Transactions de service</option>
            <option value="SERVICE">Catalogue des services</option>
            <option value="STUDENT">Étudiants</option>
            <option value="USER">Utilisateurs</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="log-action">
            Action
          </label>
          <select
            id="log-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
          >
            <option value="ALL">Toutes les actions</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement du journal...</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Aucune entrée d’audit trouvée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Date &amp; Heure</th>
                  <th className="py-3 px-4">Acteur</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entité</th>
                  <th className="py-3 px-4">Métadonnées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{log.actorName}</div>
                      <div className="text-xs text-slate-500">
                        @{log.actorUsername} · {log.actorRole === 'SUPERVISOR' ? 'Superviseur' : 'Agent'}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 border border-slate-200">
                        <ShieldAlert className="h-3.5 w-3.5 text-[#332E86]" />
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono-ref text-slate-600 whitespace-nowrap">
                      {log.entityType}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 font-mono-ref break-all max-w-md">
                      {Object.entries(log.metadata)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(' · ')}
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
