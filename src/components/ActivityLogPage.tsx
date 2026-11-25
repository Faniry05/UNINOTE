import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, AlertCircle } from 'lucide-react';
import { activityLogService } from '../api/activity-log.service';
import type { ActivityLogEntry } from '../types/scolarite';
import { ACTION_LABELS } from '../utils/activity-labels';
import { formatDateTime } from '../utils/format';


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
    <div className="space-y-[9px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-2">
        <div>
          <div data-enter="fade" className="scene-text font-mono-ref text-[12.6px]">UniNotes&nbsp;&nbsp;Scolarité / Historique /</div>
          <h1 data-enter="blur" className="scene-text scene-title mt-2">Historique</h1>
          <p data-enter="fade" className="scene-text text-[14px] mt-3 max-w-2xl">
            Historique infalsifiable des opérations guichet, modifications tarifaires, annulations et corrections.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadLogs()}
          className="card h-[38px] rounded-xl px-3 inline-flex items-center gap-2 mono text-[11px] hover:bg-amber-light self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <div data-enter="rise" className="glass-panel rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1" htmlFor="log-entity">
            Type d’entité
          </label>
          <select
            id="log-entity"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
          >
            <option value="ALL">Toutes les entités</option>
            <option value="SERVICE_TRANSACTION">Transactions de service</option>
            <option value="PAYMENT">Paiements</option>
            <option value="PRODUCTION_REQUEST">Demandes de production</option>
            <option value="SERVICE">Catalogue des services</option>
            <option value="STUDENT">Étudiants</option>
            <option value="USER">Utilisateurs</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1" htmlFor="log-action">
            Action
          </label>
          <select
            id="log-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
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

      <div data-enter="rise" className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-ink/60">Chargement du journal...</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink/60">Aucune entrée d’audit trouvée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 bg-panel/60 text-xs font-medium text-ink/70">
                  <th className="py-3 px-4">Date &amp; Heure</th>
                  <th className="py-3 px-4">Acteur</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entité</th>
                  <th className="py-3 px-4">Métadonnées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 text-sm">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-panel/60 align-top">
                    <td className="py-3 px-4 text-xs text-ink/70 tabular-nums whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-ink">{log.actorName}</div>
                      <div className="text-xs text-ink/60">
                        @{log.actorUsername} · {log.actorRole === 'SUPERVISOR' ? 'Superviseur' : 'Agent'}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-panel px-2.5 py-1 text-xs font-medium text-ink/90 border border-ink/10">
                        <ShieldAlert className="h-3.5 w-3.5 text-ink" />
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono-ref text-ink/70 whitespace-nowrap">
                      {log.entityType}
                    </td>
                    <td className="py-3 px-4 text-xs text-ink/80 font-mono-ref break-all max-w-md">
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
