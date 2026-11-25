import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { activityLogService } from '../api/activity-log.service';
import type { ActivityLogEntry } from '../types/scolarite';
import { ACTION_LABELS } from '../utils/activity-labels';
import { formatDateTime } from '../utils/format';

/** Chronological, read-only history of a transaction (sale, payment, production). */
export function TransactionTimeline({ transactionId, refreshKey = 0 }: { transactionId: string; refreshKey?: number }) {
  const [logs, setLogs] = useState<ActivityLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    activityLogService
      .getTransactionHistory(transactionId)
      .then((l) => active && setLogs(l))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Historique indisponible.'));
    return () => {
      active = false;
    };
  }, [transactionId, refreshKey]);

  if (error) return <div className="text-xs text-rose-700">{error}</div>;
  if (!logs) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de l’historique...
      </div>
    );
  }
  if (logs.length === 0) return <div className="text-xs text-slate-500">Aucun événement enregistré.</div>;

  return (
    <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
      {logs.map((log) => (
        <li key={log.id} className="ml-4">
          <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-[#332E86]" />
          <div className="text-xs font-semibold text-slate-900">{ACTION_LABELS[log.action] ?? log.action}</div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {formatDateTime(log.createdAt)} · {log.actorName}
          </div>
          {typeof log.metadata.reason === 'string' && (
            <div className="text-[11px] text-slate-600 mt-0.5">Motif : {log.metadata.reason}</div>
          )}
          {typeof log.metadata.documentReference === 'string' && (
            <div className="text-[11px] font-mono-ref text-slate-600 mt-0.5">{log.metadata.documentReference}</div>
          )}
          {typeof log.metadata.deliveredTo === 'string' && (
            <div className="text-[11px] text-slate-600 mt-0.5">Remis à : {log.metadata.deliveredTo}</div>
          )}
        </li>
      ))}
    </ol>
  );
}
