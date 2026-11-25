import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileEdit,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Users,
  X,
  XCircle,
  AlertCircle,
  FileClock,
  Hammer,
  PackageCheck,
  HandHeart,
} from 'lucide-react';
import { getServiceFields } from '../../shared/service-forms';
import { paymentsService } from '../api/payments.service';
import { authService } from '../api/auth.service';
import { catalogService } from '../api/catalog.service';
import { salesDashboardService } from '../api/sales-dashboard.service';
import { transactionsService } from '../api/transactions.service';
import type {
  AgentSalesBreakdown,
  DatePeriodFilter,
  ProductionStatus,
  ProductionSummary,
  SalesSummary,
  ServiceItem,
  ServiceSalesBreakdown,
  ServiceTransaction,
  User,
} from '../types/scolarite';
import { formatAriary, formatDateTime } from '../utils/format';
import { DocumentPreview } from './DocumentPreview';
import { PaymentStatusBadge, PRODUCTION_STATUS_LABELS, ProductionStatusBadge, TransactionStatusBadge } from './StatusBadge';
import { TransactionTimeline } from './TransactionTimeline';
import { Chip, PageHeader } from '../ui/PageHeader';
import { countUp } from '../ui/motion';
import { prefersReducedMotion } from '../ui/scene';

export function SupervisorDashboard() {
  const [period, setPeriod] = useState<DatePeriodFilter>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [agentFilter, setAgentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [productionFilter, setProductionFilter] = useState<ProductionStatus | 'ALL'>('ALL');
  const [productionSummary, setProductionSummary] = useState<ProductionSummary | null>(null);
  const [previewProductionId, setPreviewProductionId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [search, setSearch] = useState('');

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [agents, setAgents] = useState<User[]>([]);

  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [byService, setByService] = useState<ServiceSalesBreakdown[]>([]);
  const [byAgent, setByAgent] = useState<AgentSalesBreakdown[]>([]);
  const [transactions, setTransactions] = useState<ServiceTransaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Service Detail Modal
  const [selectedServiceDetail, setSelectedServiceDetail] = useState<ServiceSalesBreakdown | null>(null);
  const [serviceDetailTxs, setServiceDetailTxs] = useState<ServiceTransaction[]>([]);
  const [loadingServiceDetail, setLoadingServiceDetail] = useState(false);

  // Transaction Inspection / Cancel / Correct Modals
  const [inspectTx, setInspectTx] = useState<ServiceTransaction | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ServiceTransaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [correctTarget, setCorrectTarget] = useState<ServiceTransaction | null>(null);
  const [correctReason, setCorrectReason] = useState('');
  const [correctServiceId, setCorrectServiceId] = useState('');
  const [correctPaid, setCorrectPaid] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load reference dropdowns once
  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [srvList, usrList] = await Promise.all([catalogService.getServices(true), authService.getUsers()]);
        if (active) {
          setServices(srvList);
          setAgents(usrList);
        }
      } catch {
        // Handled on main fetch
      }
    }
    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const filters = {
      period,
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined,
      serviceId: serviceFilter !== 'ALL' ? serviceFilter : undefined,
      agentId: agentFilter !== 'ALL' ? agentFilter : undefined,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
      productionStatus: productionFilter !== 'ALL' ? productionFilter : undefined,
      search: search.trim() || undefined,
    };

    try {
      const [sumRes, srvRes, agRes, txRes, prodRes] = await Promise.all([
        salesDashboardService.getSalesSummary(filters),
        salesDashboardService.getSalesByService(filters),
        salesDashboardService.getSalesByAgent(filters),
        transactionsService.getTransactions(filters),
        salesDashboardService.getProductionSummary(filters),
      ]);
      setSummary(sumRes);
      setProductionSummary(prodRes);
      setByService(srvRes);
      setByAgent(agRes);
      setTransactions(txRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement du tableau de bord.');
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, serviceFilter, agentFilter, statusFilter, productionFilter, search]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function openServiceDetails(item: ServiceSalesBreakdown) {
    setSelectedServiceDetail(item);
    setLoadingServiceDetail(true);
    try {
      const list = await transactionsService.getTransactions({
        period,
        startDate: period === 'custom' ? startDate : undefined,
        endDate: period === 'custom' ? endDate : undefined,
        serviceId: item.serviceId,
        agentId: agentFilter !== 'ALL' ? agentFilter : undefined,
      });
      setServiceDetailTxs(list);
    } catch {
      setServiceDetailTxs([]);
    } finally {
      setLoadingServiceDetail(false);
    }
  }

  async function handleConfirmPayment(tx: ServiceTransaction) {
    setActionBusy(true);
    setActionError(null);
    try {
      await paymentsService.recordCashPayment({ transactionId: tx.id, amountReceived: tx.priceAtTransaction });
      await loadDashboard();
      if (selectedServiceDetail) {
        await openServiceDetails(selectedServiceDetail);
      }
      if (inspectTx?.id === tx.id) {
        const refreshed = await transactionsService.getTransactionById(tx.id);
        setInspectTx(refreshed);
        setHistoryKey((k) => k + 1);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Impossible de confirmer le paiement.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancelSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await transactionsService.cancelTransaction(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason('');
      await loadDashboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur lors de l’annulation.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCorrectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!correctTarget || correctReason.trim().length < 3 || !correctServiceId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await transactionsService.correctTransaction(correctTarget.id, {
        reason: correctReason.trim(),
        serviceId: correctServiceId,
        paymentConfirmed: correctPaid,
      });
      setCorrectTarget(null);
      setCorrectReason('');
      await loadDashboard();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur lors de la correction.');
    } finally {
      setActionBusy(false);
    }
  }

  const periodOptions: Array<{ id: DatePeriodFilter; label: string }> = [
    { id: 'today', label: 'Aujourd’hui' },
    { id: 'week', label: 'Cette semaine' },
    { id: 'month', label: 'Ce mois-ci' },
    { id: 'all', label: 'Tout l’historique' },
    { id: 'custom', label: 'Période personnalisée' },
  ];

  const periodLabel = periodOptions.find((p) => p.id === period)?.label ?? '';
  const revenue = summary?.confirmedRevenue ?? 0;
  const potential = revenue + (summary?.pendingAmount ?? 0);
  const totalRevenueByService = byService.reduce((sum, s) => sum + s.confirmedRevenue, 0);
  const productionTotal =
    (productionSummary?.toProduce ?? 0) +
    (productionSummary?.inProduction ?? 0) +
    (productionSummary?.ready ?? 0) +
    (productionSummary?.delivered ?? 0);

  return (
    <div className="space-y-[9px]">
      <div className="pb-[9px]">
        <PageHeader
          trail={['Scolarité', 'Supervision']}
          title="Ventes & recettes"
          chips={
            <>
              <Chip icon={<Banknote className="h-3 w-3" />}>{formatAriary(revenue)} encaissés</Chip>
              <Chip icon={<Layers className="h-3 w-3" />}>{summary?.totalTransactions ?? '—'} ventes · {periodLabel}</Chip>
            </>
          }
          actions={
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="card h-[38px] rounded-xl px-3 inline-flex items-center gap-2 mono text-[11px] hover:bg-amber-light cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          }
        />
      </div>

      {/* Filters */}
      <div data-enter="rise" className="card rounded-2xl p-[14px] space-y-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="h-4 w-4 shrink-0" />
            <div className="tabbar min-w-0" role="tablist" aria-label="Période">
              {periodOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={period === opt.id}
                  data-active={period === opt.id}
                  onClick={() => setPeriod(opt.id)}
                  className="tab"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <select aria-label="Prestation" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="field mono text-[11.5px]">
              <option value="ALL">Toutes prestations</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select aria-label="Agent" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="field mono text-[11.5px]">
              <option value="ALL">Tous les agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
            <select aria-label="Statut de vente" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="field mono text-[11.5px]">
              <option value="ALL">Tous statuts</option>
              <option value="COMPLETED">Payées</option>
              <option value="PENDING">Non encaissées</option>
              <option value="CANCELLED">Annulées</option>
            </select>
            <select
              aria-label="Statut de production"
              value={productionFilter}
              onChange={(e) => setProductionFilter(e.target.value as ProductionStatus | 'ALL')}
              className="field mono text-[11.5px]"
            >
              <option value="ALL">Toute production</option>
              {(Object.keys(PRODUCTION_STATUS_LABELS) as ProductionStatus[]).map((st) => (
                <option key={st} value={st}>
                  {PRODUCTION_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
            <div className="relative col-span-2 md:col-span-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="RÉF., MATRICULE, NOM"
                aria-label="Recherche"
                className="field pr-9 mono text-[11.5px] placeholder:text-ink/45"
              />
              <Search className="h-4 w-4 text-ink/60 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <label className="block">
              <span className="mono text-[10.5px] text-ink/65">Du</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field mt-1" />
            </label>
            <label className="block">
              <span className="mono text-[10.5px] text-ink/65">Au</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field mt-1" />
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Sales indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-[9px]">
        <div data-enter="rise" className="card rounded-2xl p-[14px] lg:col-span-4 flex flex-col gap-[9px]">
          <span className="card-label px-1 pt-1">Recettes encaissées</span>
          <RevenueGauge revenue={revenue} potential={potential} periodLabel={periodLabel} />
          <div className="grid grid-cols-2 gap-[9px]">
            <MiniTile tone="orange" label="En attente" value={formatAriary(summary?.pendingAmount ?? 0)} />
            <MiniTile tone="amber" label="Annulées" value={String(summary?.cancelledCount ?? 0)} />
          </div>
        </div>

        <div data-enter="rise" className="card rounded-2xl p-[14px] lg:col-span-3 flex flex-col gap-[9px]">
          <span className="card-label px-1 pt-1">Ventes effectuées</span>
          <StatPanel icon={<Layers className="h-5 w-5" />} value={String(summary?.totalTransactions ?? '—')} caption="Ventes (hors annulations)" />
          <StatPanel icon={<CheckCircle2 className="h-5 w-5" />} value={String(summary?.completedCount ?? '—')} caption="Payées en espèces" />
          <StatPanel icon={<Clock className="h-5 w-5" />} value={String(summary?.pendingCount ?? '—')} caption="Non encaissées" />
        </div>

        <div data-enter="rise" className="card rounded-2xl p-[14px] lg:col-span-5 flex flex-col gap-[9px]">
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="card-label">Production documentaire</span>
            <span className="mono text-[10.5px] text-ink/60">{productionTotal} document(s)</span>
          </div>
          <div className="grid grid-cols-2 gap-[9px] flex-1">
            {(
              [
                { key: 'A_PRODUIRE', value: productionSummary?.toProduce, Icon: FileClock },
                { key: 'EN_PRODUCTION', value: productionSummary?.inProduction, Icon: Hammer },
                { key: 'PRET', value: productionSummary?.ready, Icon: PackageCheck },
                { key: 'REMIS', value: productionSummary?.delivered, Icon: HandHeart },
              ] as const
            ).map(({ key, value, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setProductionFilter(productionFilter === key ? 'ALL' : key)}
                aria-pressed={productionFilter === key}
                className={`panel p-3.5 text-left cursor-pointer transition-colors hover:bg-amber-light/60 ${
                  productionFilter === key ? '!bg-amber-light' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="icon-square h-8 w-8">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[34px] font-light leading-none tracking-[-0.04em] tabular-nums">{value ?? '—'}</span>
                </div>
                <div className="mono text-[10.5px] text-ink/70 mt-3">{PRODUCTION_STATUS_LABELS[key]}</div>
              </button>
            ))}
          </div>
          <ProductionBar summary={productionSummary} total={productionTotal} />
        </div>
      </div>

      {/* 2. Prices & sales per service — click for details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[9px]">
        {byService.map((srv) => {
          const share = totalRevenueByService > 0 ? (srv.confirmedRevenue / totalRevenueByService) * 100 : 0;
          return (
            <button
              key={srv.serviceId}
              type="button"
              data-enter="rise"
              onClick={() => openServiceDetails(srv)}
              className="card rounded-2xl p-[18px] text-left cursor-pointer transition-all hover:-translate-y-0.5 group"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="card-label">{srv.serviceName}</span>
                <span className="mono text-[10.5px] text-ink/60 inline-flex items-center gap-1 group-hover:text-ink">
                  Détails <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[52px] font-light leading-none tracking-[-0.045em] tabular-nums">{srv.totalSalesCount}</span>
                <span className="mono text-[11px] text-ink/65">vente(s)</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-[9px]">
                <div className="panel p-3">
                  <div className="mono text-[10px] text-ink/60">Prix unitaire</div>
                  <div className="font-mono-ref text-[17px] mt-1">{formatAriary(srv.currentPrice)}</div>
                </div>
                <div className="panel p-3 !bg-amber-light/70">
                  <div className="mono text-[10px] text-ink/70">Recettes</div>
                  <div className="font-mono-ref text-[17px] mt-1">{formatAriary(srv.confirmedRevenue)}</div>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-panel overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-amber transition-[width] duration-700" style={{ width: `${share}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between mono text-[10px] text-ink/60">
                <span>{Math.round(share)}% des recettes</span>
                {srv.pendingCount > 0 && <span className="text-pin-orange">{srv.pendingCount} non encaissée(s)</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Sales per agent */}
      <div data-enter="rise" className="card rounded-2xl overflow-hidden">
        <div className="px-[18px] pt-[16px] pb-3 flex items-center justify-between">
          <span className="card-label inline-flex items-center gap-2">Ventes par agent</span>
          <Users className="h-4 w-4 text-ink/60" />
        </div>
        <div className="overflow-x-auto px-[9px] pb-[9px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="mono text-[10.5px] text-ink/60">
                <th className="py-2 px-3 font-medium">Agent</th>
                <th className="py-2 px-3 font-medium text-right">Ventes</th>
                <th className="py-2 px-3 font-medium text-right">Payées</th>
                <th className="py-2 px-3 font-medium text-right">Non encaissées</th>
                <th className="py-2 px-3 font-medium text-right">Recettes</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {byAgent.map((ag) => (
                <tr key={ag.agentId} className="border-t border-ink/10">
                  <td className="py-2.5 px-3">
                    <div>{ag.agentName}</div>
                    <div className="font-mono-ref text-[11px] text-ink/55">
                      @{ag.agentUsername} · {ag.agentRole === 'SUPERVISOR' ? 'responsable' : 'guichet'}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{ag.totalTransactions}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{ag.completedCount}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{ag.pendingCount}</td>
                  <td className="py-2.5 px-3 text-right font-mono-ref text-[13px] whitespace-nowrap">{formatAriary(ag.confirmedRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div data-enter="rise" className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          <span className="card-label">Transactions</span>
          <span className="text-xs text-ink/60 tabular-nums">{transactions.length} résultat(s)</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-ink/60">Chargement des transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink/60">
            Aucune transaction ne correspond aux critères sélectionnés.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 bg-panel/60 text-xs font-medium text-ink/70">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Matricule</th>
                  <th className="py-3 px-4">Étudiant</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4 text-right">Prix appliqué</th>
                  <th className="py-3 px-4">Agent</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Production</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 text-sm">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-panel/60">
                    <td className="py-3 px-4 font-mono-ref text-xs font-medium text-ink whitespace-nowrap">
                      {tx.reference}
                    </td>
                    <td className="py-3 px-4 font-mono-ref text-xs text-ink/80 whitespace-nowrap">
                      {tx.studentMatricule}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-ink">
                        {tx.studentNom} {tx.studentPrenom}
                      </div>
                      <div className="text-xs text-ink/60">{tx.studentPromotion}</div>
                    </td>
                    <td className="py-3 px-4 text-ink/90 whitespace-nowrap">{tx.serviceName}</td>
                    <td className="py-3 px-4 text-right font-medium text-ink tabular-nums whitespace-nowrap">
                      {formatAriary(tx.priceAtTransaction)}
                    </td>
                    <td className="py-3 px-4 text-xs text-ink/80 whitespace-nowrap">{tx.agentName}</td>
                    <td className="py-3 px-4 text-xs text-ink/70 tabular-nums whitespace-nowrap">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        <TransactionStatusBadge status={tx.status} />
                        <PaymentStatusBadge paymentStatus={tx.paymentStatus} />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <ProductionStatusBadge status={tx.productionStatus} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectTx(tx)}
                          title="Détails"
                          className="rounded-lg border border-ink/10 bg-white p-1.5 text-ink/70 hover:text-ink hover:border-ink/40 cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {tx.status === 'PENDING' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleConfirmPayment(tx)}
                            title="Confirmer paiement"
                            className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        {tx.status !== 'CANCELLED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCorrectTarget(tx);
                                setCorrectServiceId(tx.serviceId);
                                setCorrectPaid(tx.paymentStatus === 'PAID');
                                setCorrectReason('');
                                setActionError(null);
                              }}
                              title="Corriger"
                              className="rounded-lg border border-ink/10 bg-white p-1.5 text-ink/70 hover:text-ink cursor-pointer"
                            >
                              <FileEdit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTarget(tx);
                                setCancelReason('');
                                setActionError(null);
                              }}
                              title="Annuler"
                              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 cursor-pointer"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Service Detail Modal */}
      {selectedServiceDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-white border border-ink/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between bg-panel/60">
              <div>
                <h3 className="text-lg font-medium text-ink">{selectedServiceDetail.serviceName}</h3>
                <p className="text-xs text-ink/70 mt-0.5 tabular-nums">
                  {selectedServiceDetail.totalSalesCount} vente(s) · Chiffre d’affaires encaissé :{' '}
                  <strong className="text-ink">{formatAriary(selectedServiceDetail.confirmedRevenue)}</strong>
                  {selectedServiceDetail.pendingCount > 0 &&
                    ` · ${selectedServiceDetail.pendingCount} en attente (${formatAriary(selectedServiceDetail.pendingAmount)})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedServiceDetail(null)}
                className="rounded-lg p-1.5 text-ink/60 hover:bg-amber-light/50/70 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {loadingServiceDetail ? (
                <div className="py-10 text-center text-sm text-ink/60">Chargement des transactions...</div>
              ) : serviceDetailTxs.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink/60">
                  Aucune transaction enregistrée pour ce service sur la période filtrée.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-xs font-medium text-ink/70">
                      <th className="py-2.5 pr-3">Référence</th>
                      <th className="py-2.5 px-3">Étudiant</th>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3 text-right">Tarif appliqué</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Paiement</th>
                      <th className="py-2.5 pl-3">Production</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {serviceDetailTxs.map((tx) => (
                      <tr key={tx.id} onClick={() => setInspectTx(tx)} className="cursor-pointer hover:bg-panel/60">
                        <td className="py-2.5 pr-3 font-mono-ref text-xs font-medium text-ink">
                          {tx.reference}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-ink">
                            {tx.studentNom} {tx.studentPrenom}
                          </div>
                          <div className="text-xs text-ink/60 font-mono-ref">{tx.studentMatricule}</div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-ink/80">{tx.agentName}</td>
                        <td className="py-2.5 px-3 text-right font-medium tabular-nums">
                          {formatAriary(tx.priceAtTransaction)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-ink/70 tabular-nums">
                          {formatDateTime(tx.createdAt)}
                        </td>
                        <td className="py-2.5 px-3">
                          <PaymentStatusBadge paymentStatus={tx.paymentStatus} />
                        </td>
                        <td className="py-2.5 pl-3">
                          <ProductionStatusBadge status={tx.productionStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inspect Transaction Modal */}
      {inspectTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <div>
                <h3 className="text-lg font-medium text-ink">Détail de la transaction</h3>
                <p className="text-xs font-mono-ref text-ink font-medium">{inspectTx.reference}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectTx(null)}
                className="rounded-lg p-1.5 text-ink/60 hover:bg-panel cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink/60">Prestation</span>
                <span className="font-medium text-ink">{inspectTx.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Prix historique appliqué</span>
                <span className="font-medium text-ink tabular-nums">
                  {formatAriary(inspectTx.priceAtTransaction)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Étudiant</span>
                <span className="font-medium text-ink">
                  {inspectTx.studentNom} {inspectTx.studentPrenom} ({inspectTx.studentMatricule})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Promotion</span>
                <span className="text-ink/90">{inspectTx.studentPromotion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Opérateur</span>
                <span className="text-ink/90">{inspectTx.agentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Date de création</span>
                <span className="text-ink/90 tabular-nums">{formatDateTime(inspectTx.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-ink/60">Statut &amp; Paiement</span>
                <div className="flex gap-1.5">
                  <TransactionStatusBadge status={inspectTx.status} />
                  <PaymentStatusBadge paymentStatus={inspectTx.paymentStatus} />
                </div>
              </div>
              {inspectTx.paymentConfirmedAt && (
                <div className="flex justify-between text-xs text-ink/60">
                  <span>Paiement confirmé par</span>
                  <span>
                    {inspectTx.paymentConfirmedByName} ({formatDateTime(inspectTx.paymentConfirmedAt)})
                  </span>
                </div>
              )}
              {getServiceFields(inspectTx.serviceCode).map((f) =>
                inspectTx.details?.[f.key] ? (
                  <div key={f.key} className="flex justify-between">
                    <span className="text-ink/60">{f.label.replace(' (optionnel)', '')}</span>
                    <span className="text-ink/90 text-right">
                      {f.options?.find((o) => o.value === inspectTx.details[f.key])?.label ?? inspectTx.details[f.key]}
                    </span>
                  </div>
                ) : null
              )}
              <div className="flex justify-between items-center">
                <span className="text-ink/60">Production</span>
                <ProductionStatusBadge status={inspectTx.productionStatus} />
              </div>
              {inspectTx.documentReference && inspectTx.productionId && (
                <div className="flex justify-between items-center">
                  <span className="text-ink/60">Document</span>
                  <button
                    type="button"
                    onClick={() => setPreviewProductionId(inspectTx.productionId)}
                    className="font-mono-ref text-xs font-medium text-ink hover:underline cursor-pointer"
                  >
                    {inspectTx.documentReference}
                  </button>
                </div>
              )}
              {inspectTx.notes && (
                <div className="rounded-xl bg-panel/60 border border-ink/10 p-3 text-xs text-ink/80">
                  <strong className="block text-ink mb-0.5">Observations :</strong>
                  {inspectTx.notes}
                </div>
              )}
              {inspectTx.cancelReason && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  <strong className="block mb-0.5">
                    Motif d’annulation ({inspectTx.cancelledByName ?? 'Superviseur'}) :
                  </strong>
                  {inspectTx.cancelReason}
                </div>
              )}
            </div>

            <div className="border-t border-ink/10 pt-4">
              <h4 className="text-sm font-medium text-ink mb-3">Historique des actions</h4>
              <TransactionTimeline transactionId={inspectTx.id} refreshKey={historyKey} />
            </div>
          </div>
        </div>
      )}

      {/* Cancel Transaction Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCancelSubmit} className="w-full max-w-md rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
            <h3 className="text-lg font-medium text-ink">Annuler la transaction</h3>
            <p className="text-sm text-ink/70">
              Référence <strong className="font-mono-ref text-ink">{cancelTarget.reference}</strong> —{' '}
              {formatAriary(cancelTarget.priceAtTransaction)}. L’opération restera conservée dans le journal d’audit.
            </p>
            {actionError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="cancel-reason">
                Motif obligatoire de l’annulation *
              </label>
              <textarea
                id="cancel-reason"
                required
                minLength={3}
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex. Erreur de prestation sélectionnée lors de la saisie au guichet..."
                className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-ink/80 hover:bg-panel/60 cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {actionBusy ? 'Annulation...' : 'Confirmer l’annulation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Authorized Correction Modal */}
      {correctTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCorrectSubmit} className="w-full max-w-md rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-medium text-ink">Corriger la transaction</h3>
              <p className="text-xs text-ink/70 mt-1">
                L’opération <span className="font-mono-ref font-medium">{correctTarget.reference}</span> sera annulée
                et remplacée par une nouvelle écriture tracée dans le journal d’audit.
              </p>
            </div>
            {actionError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="corr-srv">
                Nouvelle prestation
              </label>
              <select
                id="corr-srv"
                value={correctServiceId}
                onChange={(e) => setCorrectServiceId(e.target.value)}
                className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              >
                {services
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {formatAriary(s.price)}
                    </option>
                  ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink/90 cursor-pointer">
              <input
                type="checkbox"
                checked={correctPaid}
                onChange={(e) => setCorrectPaid(e.target.checked)}
                className="h-4 w-4 rounded border-ink/15 text-ink"
              />
              Paiement encaissé confirmé
            </label>
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="corr-reason">
                Motif de correction *
              </label>
              <textarea
                id="corr-reason"
                required
                minLength={3}
                rows={3}
                value={correctReason}
                onChange={(e) => setCorrectReason(e.target.value)}
                placeholder="Ex. L'étudiant souhaitait une Attestation au lieu d'un Relevé de notes..."
                className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectTarget(null)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-ink/80 hover:bg-panel/60 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 cursor-pointer"
              >
                {actionBusy ? 'Correction...' : 'Appliquer la correction'}
              </button>
            </div>
          </form>
        </div>
      )}

      {previewProductionId && (
        <DocumentPreview productionId={previewProductionId} onClose={() => setPreviewProductionId(null)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Widgets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Semicircle gauge: thick amber gradient arc with white end knobs, a thin
 * white progress arc (share of collected revenue vs collected + pending) and
 * the big collected amount counting up.
 */
function RevenueGauge({ revenue, potential, periodLabel }: { revenue: number; potential: number; periodLabel: string }) {
  const [shown, setShown] = useState(0);
  const [drawn, setDrawn] = useState(prefersReducedMotion());
  const pct = potential > 0 ? Math.min(100, (revenue / potential) * 100) : 0;

  useEffect(() => countUp(0, revenue, 1400, setShown), [revenue]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const arc = 'M 30 120 A 90 90 0 0 1 210 120';
  return (
    <div className="panel px-4 pt-4 pb-3 flex flex-col items-center">
      <span className="chip !h-[26px] !bg-cream text-[11px]">{periodLabel}</span>
      <div className="relative w-full max-w-[300px] mt-1">
        <svg viewBox="0 0 240 132" className="w-full" aria-hidden>
          <defs>
            <linearGradient id="gauge-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#E7E1D3" />
              <stop offset="55%" stopColor="#F8C44C" />
              <stop offset="100%" stopColor="#F6B12A" />
            </linearGradient>
          </defs>
          <path d={arc} fill="none" stroke="url(#gauge-grad)" strokeWidth="24" strokeLinecap="round" />
          <path
            d={arc}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={drawn ? 100 - pct : 100}
            style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)' }}
          />
          <circle cx="30" cy="120" r="7" fill="#fff" />
          <circle cx="210" cy="120" r="7" fill="#fff" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="text-[44px] font-light leading-none tracking-[-0.045em] tabular-nums">
            {shown.toLocaleString('en-US')}
          </div>
          <div className="mono text-[10.5px] text-ink/60 mt-1">Ariary</div>
        </div>
      </div>
      <div className="w-full mt-2 grid grid-cols-3 items-center font-mono-ref text-[11px] text-ink/70">
        <span>0 Ar</span>
        <span className="text-center normal-case">{Math.round(pct)}% encaissé</span>
        <span className="text-right">{formatAriary(potential)}</span>
      </div>
    </div>
  );
}

function MiniTile({ tone, label, value }: { tone: 'orange' | 'amber'; label: string; value: string }) {
  return (
    <div className="panel p-3 flex items-center gap-2.5">
      <span className={`h-6 w-6 shrink-0 rounded-full ${tone === 'orange' ? 'bg-pin-orange' : 'bg-amber-light'}`} aria-hidden />
      <div className="min-w-0">
        <div className="mono text-[10px] text-ink/60">{label}</div>
        <div className="font-mono-ref text-[16px] truncate">{value}</div>
      </div>
    </div>
  );
}

function StatPanel({ icon, value, caption }: { icon: ReactNode; value: string; caption: string }) {
  return (
    <div className="panel p-3.5 flex-1 flex items-center gap-3.5 min-h-[86px]">
      <span className="icon-square h-11 w-11 shrink-0">{icon}</span>
      <div>
        <div className="text-[34px] font-light leading-none tracking-[-0.04em] tabular-nums">{value}</div>
        <div className="mono text-[10.5px] text-ink/65 mt-1.5">{caption}</div>
      </div>
    </div>
  );
}

function ProductionBar({ summary, total }: { summary: ProductionSummary | null; total: number }) {
  if (!summary || total === 0) return null;
  const parts = [
    { v: summary.toProduce, c: '#F59E0B' },
    { v: summary.inProduction, c: '#F6B733' },
    { v: summary.ready, c: '#FBD06A' },
    { v: summary.delivered, c: '#C9C5BC' },
  ];
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-panel" aria-hidden>
      {parts.map((p, i) => (
        <div key={i} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />
      ))}
    </div>
  );
}
