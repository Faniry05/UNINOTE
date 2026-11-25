import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, FileText, Hammer, HandHeart, Loader2, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { productionService } from '../api/production.service';
import { getServiceFields } from '../../shared/service-forms';
import type { ProductionRequest, ProductionStatus, User } from '../types/scolarite';
import { formatAriary, formatDateTime } from '../utils/format';
import { DocumentPreview } from './DocumentPreview';
import { PRODUCTION_STATUS_LABELS, ProductionStatusBadge } from './StatusBadge';
import { TransactionTimeline } from './TransactionTimeline';

interface ProductionTrackingPageProps {
  currentUser: User;
  focusProductionId?: string | null;
}

type Tab = ProductionStatus | 'ALL';
const TABS: Tab[] = ['A_PRODUIRE', 'EN_PRODUCTION', 'PRET', 'REMIS', 'ALL'];

type PendingAction =
  | { kind: 'verify'; pr: ProductionRequest }
  | { kind: 'deliver'; pr: ProductionRequest }
  | { kind: 'regenerate'; pr: ProductionRequest };

export function ProductionTrackingPage({ currentUser, focusProductionId }: ProductionTrackingPageProps) {
  const isSupervisor = currentUser.role === 'SUPERVISOR';
  const [items, setItems] = useState<ProductionRequest[]>([]);
  const [tab, setTab] = useState<Tab>('A_PRODUIRE');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ProductionRequest | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [verifiedChecked, setVerifiedChecked] = useState(false);
  const [deliveredTo, setDeliveredTo] = useState('');
  const [regenReason, setRegenReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await productionService.getProductionRequests({ search: search.trim() || undefined });
      setItems(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les demandes de production.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load().then((list) => {
      if (focusProductionId) {
        const found = list.find((p) => p.id === focusProductionId);
        if (found) {
          setDetail(found);
          setTab(found.status);
        }
      }
    });
    // Initial load only; later reloads are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { A_PRODUIRE: 0, EN_PRODUCTION: 0, PRET: 0, REMIS: 0, ALL: 0 };
    for (const p of items) {
      if (p.transactionStatus === 'CANCELLED') continue;
      c[p.status] += 1;
      c.ALL += 1;
    }
    return c;
  }, [items]);

  const visible = tab === 'ALL' ? items : items.filter((p) => p.status === tab && p.transactionStatus !== 'CANCELLED');

  async function applyTransition(pr: ProductionRequest, status: ProductionStatus, options = {}) {
    setBusyId(pr.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await productionService.updateProductionStatus(pr.id, status, options);
      setNotice(`${updated.transactionReference} : ${PRODUCTION_STATUS_LABELS[updated.status]}.`);
      setPending(null);
      await load();
      if (detail?.id === pr.id) {
        setDetail(updated);
        setHistoryKey((k) => k + 1);
      }
      if (status === 'EN_PRODUCTION') setPreviewId(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Changement de statut impossible.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRegenerate(e: FormEvent) {
    e.preventDefault();
    if (!pending || pending.kind !== 'regenerate') return;
    const pr = pending.pr;
    setBusyId(pr.id);
    setError(null);
    try {
      const updated = await productionService.regenerateDocument(pr.id, regenReason.trim());
      setPending(null);
      await load();
      if (detail?.id === pr.id) {
        setDetail(updated);
        setHistoryKey((k) => k + 1);
      }
      setPreviewId(pr.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Régénération impossible.');
    } finally {
      setBusyId(null);
    }
  }

  function renderActions(pr: ProductionRequest) {
    if (pr.transactionStatus === 'CANCELLED') {
      return <span className="text-xs font-medium text-rose-700">Transaction annulée — gelée</span>;
    }
    const busy = busyId === pr.id;
    const btn =
      'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60 cursor-pointer';
    return (
      <div className="inline-flex flex-wrap justify-end gap-1.5">
        {pr.generatedDocumentReference && (
          <button type="button" onClick={() => setPreviewId(pr.id)} className={`${btn} border border-slate-200 bg-white text-slate-700 hover:text-[#332E86]`}>
            <Eye className="h-3.5 w-3.5" /> Document
          </button>
        )}
        {pr.status === 'A_PRODUIRE' && (
          <button type="button" disabled={busy} onClick={() => applyTransition(pr, 'EN_PRODUCTION')} className={`${btn} bg-[#332E86] text-white hover:bg-[#28246b]`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />} Démarrer la production
          </button>
        )}
        {pr.status === 'EN_PRODUCTION' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRegenReason('');
                setPending({ kind: 'regenerate', pr });
              }}
              className={`${btn} border border-slate-200 bg-white text-slate-700`}
              title="Régénérer le document (nouvelle version)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setVerifiedChecked(false);
                setPending({ kind: 'verify', pr });
              }}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Vérifier → Prêt
            </button>
          </>
        )}
        {pr.status === 'PRET' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDeliveredTo(`${pr.studentNom} ${pr.studentPrenom}`);
              setPending({ kind: 'deliver', pr });
            }}
            className={`${btn} bg-[#332E86] text-white hover:bg-[#28246b]`}
          >
            <HandHeart className="h-3.5 w-3.5" /> Marquer remis
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">Production documentaire</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Suivi de production</h1>
          <p className="text-sm text-slate-600 mt-1">
            {isSupervisor
              ? 'Toutes les demandes de production créées après un paiement confirmé.'
              : 'Demandes issues de vos ventes : produire, vérifier, puis remettre le document.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 self-start cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                tab === t ? 'bg-[#332E86] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t === 'ALL' ? 'Toutes' : PRODUCTION_STATUS_LABELS[t]}{' '}
              <span className="tabular-nums opacity-80">({counts[t]})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 lg:max-w-sm lg:ml-auto">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Référence, matricule, nom... (Entrée)"
            className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement des demandes...</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Aucune demande dans cette catégorie.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Étudiant</th>
                  <th className="py-3 px-4">Document</th>
                  {isSupervisor && <th className="py-3 px-4">Agent</th>}
                  <th className="py-3 px-4">Demandé le</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visible.map((pr) => (
                  <tr key={pr.id} className={`hover:bg-slate-50/70 ${detail?.id === pr.id ? 'bg-indigo-50/50' : ''}`}>
                    <td className="py-3 px-4">
                      <button type="button" onClick={() => setDetail(pr)} className="font-mono-ref text-xs font-semibold text-[#332E86] hover:underline cursor-pointer whitespace-nowrap">
                        {pr.transactionReference}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{pr.studentNom} {pr.studentPrenom}</div>
                      <div className="text-xs text-slate-500 font-mono-ref">{pr.studentMatricule}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 whitespace-nowrap">{pr.serviceName}</div>
                      {pr.generatedDocumentReference && (
                        <div className="text-[11px] font-mono-ref text-slate-500">{pr.generatedDocumentReference}</div>
                      )}
                    </td>
                    {isSupervisor && <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">{pr.requestedByName}</td>}
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">{formatDateTime(pr.createdAt)}</td>
                    <td className="py-3 px-4"><ProductionStatusBadge status={pr.status} /></td>
                    <td className="py-3 px-4 text-right">{renderActions(pr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail side panel */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500">Demande de production</div>
                <h3 className="text-lg font-bold text-slate-900">{detail.serviceName}</h3>
                <div className="font-mono-ref text-xs font-semibold text-[#332E86]">{detail.transactionReference}</div>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <ProductionStatusBadge status={detail.status} />
              {detail.transactionStatus === 'CANCELLED' && (
                <span className="text-xs font-medium text-rose-700">Transaction annulée</span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Étudiant</dt>
                <dd className="font-medium text-slate-900">
                  {detail.studentNom} {detail.studentPrenom} · <span className="font-mono-ref text-xs">{detail.studentMatricule}</span>
                </dd>
                <dd className="text-xs text-slate-500">{detail.studentPromotion}</dd>
              </div>
              {getServiceFields(detail.serviceCode).map((f) =>
                detail.details[f.key] ? (
                  <div key={f.key}>
                    <dt className="text-xs text-slate-500">{f.label.replace(' (optionnel)', '')}</dt>
                    <dd className="text-slate-900">
                      {f.options?.find((o) => o.value === detail.details[f.key])?.label ?? detail.details[f.key]}
                    </dd>
                  </div>
                ) : null
              )}
              <div>
                <dt className="text-xs text-slate-500">Prix payé</dt>
                <dd className="font-semibold text-[#332E86] tabular-nums">{formatAriary(detail.priceAtTransaction)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Document</dt>
                <dd className="font-mono-ref text-xs text-slate-900">{detail.generatedDocumentReference ?? 'Non généré'}</dd>
              </div>
              {detail.verifiedByName && (
                <div>
                  <dt className="text-xs text-slate-500">Vérifié par</dt>
                  <dd className="text-slate-900">{detail.verifiedByName}</dd>
                </div>
              )}
              {detail.deliveredAt && (
                <div>
                  <dt className="text-xs text-slate-500">Remis à</dt>
                  <dd className="text-slate-900">{detail.deliveredTo ?? '—'}</dd>
                </div>
              )}
            </dl>

            <div className="flex justify-end">{renderActions(detail)}</div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Historique</h4>
              <TransactionTimeline transactionId={detail.transactionId} refreshKey={historyKey} />
            </div>
          </aside>
        </div>
      )}

      {/* Verification before READY */}
      {pending?.kind === 'verify' && (
        <Modal title="Vérifier le document" onClose={() => setPending(null)}>
          <p className="text-sm text-slate-600">
            Contrôlez le document <span className="font-mono-ref font-semibold">{pending.pr.generatedDocumentReference}</span>{' '}
            (identité, année, contenu) avant de le déclarer prêt.
          </p>
          <button type="button" onClick={() => setPreviewId(pending.pr.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#332E86] hover:underline cursor-pointer">
            <FileText className="h-4 w-4" /> Ouvrir le document
          </button>
          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 cursor-pointer">
            <input type="checkbox" checked={verifiedChecked} onChange={(e) => setVerifiedChecked(e.target.checked)} className="mt-0.5 h-4 w-4" />
            J’ai vérifié le document et il est conforme à la demande.
          </label>
          <ModalActions
            busy={busyId === pending.pr.id}
            disabled={!verifiedChecked}
            label="Marquer prêt"
            onCancel={() => setPending(null)}
            onConfirm={() => applyTransition(pending.pr, 'PRET', { verified: true })}
          />
        </Modal>
      )}

      {pending?.kind === 'deliver' && (
        <Modal title="Remise du document" onClose={() => setPending(null)}>
          <p className="text-sm text-slate-600">
            Confirmez la remise de « {pending.pr.serviceName} » ({pending.pr.transactionReference}).
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="delivered-to">
              Remis à
            </label>
            <input
              id="delivered-to"
              type="text"
              value={deliveredTo}
              onChange={(e) => setDeliveredTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
            />
          </div>
          <ModalActions
            busy={busyId === pending.pr.id}
            label="Confirmer la remise"
            onCancel={() => setPending(null)}
            onConfirm={() => applyTransition(pending.pr, 'REMIS', { deliveredTo: deliveredTo.trim() })}
          />
        </Modal>
      )}

      {pending?.kind === 'regenerate' && (
        <Modal title="Régénérer le document" onClose={() => setPending(null)}>
          <form onSubmit={handleRegenerate} className="space-y-4">
            <p className="text-sm text-slate-600">
              Une nouvelle version sera générée à partir des données actuelles. L’ancienne référence reste tracée.
            </p>
            <textarea
              required
              minLength={3}
              rows={3}
              value={regenReason}
              onChange={(e) => setRegenReason(e.target.value)}
              placeholder="Motif (ex. note corrigée dans UniNotes)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
            />
            <ModalActions busy={busyId === pending.pr.id} disabled={regenReason.trim().length < 3} label="Régénérer" onCancel={() => setPending(null)} submit />
          </form>
        </Modal>
      )}

      {previewId && <DocumentPreview productionId={previewId} onClose={() => setPreviewId(null)} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  busy,
  disabled,
  label,
  onCancel,
  onConfirm,
  submit,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  onCancel: () => void;
  onConfirm?: () => void;
  submit?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
        Annuler
      </button>
      <button
        type={submit ? 'submit' : 'button'}
        disabled={busy || disabled}
        onClick={submit ? undefined : onConfirm}
        className="inline-flex items-center gap-2 rounded-xl bg-[#332E86] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28246b] disabled:opacity-50 cursor-pointer"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
