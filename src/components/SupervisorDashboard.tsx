import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">Supervision Scolarité</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Suivi des prestations</h1>
          <p className="text-sm text-slate-600 mt-1">
            Chiffre d’affaires réel, ventilation par service, contrôle des opérations en attente et activité des agents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 self-start cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Filters Panel */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 mr-1">
            <Calendar className="h-3.5 w-3.5 text-[#332E86]" />
            Période :
          </span>
          {periodOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                period === opt.id
                  ? 'bg-[#332E86] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-start">
                Date de début
              </label>
              <input
                id="filter-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-end">
                Date de fin
              </label>
              <input
                id="filter-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-service">
              Service
            </label>
            <select
              id="filter-service"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
            >
              <option value="ALL">Tous les services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-agent">
              Agent / Employé
            </label>
            <select
              id="filter-agent"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
            >
              <option value="ALL">Tous les agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} ({a.role === 'SUPERVISOR' ? 'Superviseur' : 'Guichet'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-status">
              Statut
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="COMPLETED">Validées / Encaissées</option>
              <option value="PENDING">En attente de règlement</option>
              <option value="CANCELLED">Annulées</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-production">
              Statut de production
            </label>
            <select
              id="filter-production"
              value={productionFilter}
              onChange={(e) => setProductionFilter(e.target.value as ProductionStatus | 'ALL')}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
            >
              <option value="ALL">Tous</option>
              {(Object.keys(PRODUCTION_STATUS_LABELS) as ProductionStatus[]).map((st) => (
                <option key={st} value={st}>
                  {PRODUCTION_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="filter-search">
              Recherche rapide
            </label>
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="filter-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Réf., matricule, nom..."
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Summary Cards: Revenue vs Transactions vs Pending vs Cancelled */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-hero rounded-2xl p-5 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-100">Chiffre d’affaires encaissé</span>
            <Banknote className="h-4 w-4 text-indigo-200" />
          </div>
          <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
            {summary ? formatAriary(summary.confirmedRevenue) : '—'}
          </div>
          <div className="mt-2 text-xs text-indigo-100 tabular-nums">
            {summary ? `${summary.completedCount} prestation(s) encaissée(s)` : 'Calcul en cours...'}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Total des transactions</span>
            <Layers className="h-4 w-4 text-[#332E86]" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
            {summary ? summary.totalTransactions : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Hors annulations ({summary ? `${summary.completedCount} validées · ${summary.pendingCount} en attente` : '—'})
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Opérations en attente</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3 text-3xl font-bold text-amber-700 tabular-nums tracking-tight">
            {summary ? formatAriary(summary.pendingAmount) : '—'}
          </div>
          <div className="mt-2 text-xs text-amber-800/80 tabular-nums">
            {summary ? `${summary.pendingCount} opération(s) non encaissée(s)` : '—'}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Opérations annulées</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
            {summary ? summary.cancelledCount : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Montant neutralisé : {summary ? formatAriary(summary.cancelledAmount) : '—'}
          </div>
        </div>
      </div>

      {/* Production KPIs (click to filter the transactions below) */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-3">Production documentaire</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {(
            [
              { key: 'A_PRODUIRE', value: productionSummary?.toProduce, Icon: FileClock, tone: 'text-amber-700' },
              { key: 'EN_PRODUCTION', value: productionSummary?.inProduction, Icon: Hammer, tone: 'text-sky-700' },
              { key: 'PRET', value: productionSummary?.ready, Icon: PackageCheck, tone: 'text-emerald-700' },
              { key: 'REMIS', value: productionSummary?.delivered, Icon: HandHeart, tone: 'text-slate-700' },
            ] as const
          ).map(({ key, value, Icon, tone }) => (
            <button
              key={key}
              type="button"
              onClick={() => setProductionFilter(productionFilter === key ? 'ALL' : key)}
              className={`glass-panel rounded-2xl p-4 text-left cursor-pointer transition-all hover:-translate-y-0.5 ${
                productionFilter === key ? 'ring-2 ring-[#332E86]' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Documents {PRODUCTION_STATUS_LABELS[key].toLowerCase()}</span>
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div className={`mt-2 text-2xl font-bold tabular-nums ${tone}`}>{value ?? '—'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Breakdown by Service */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Revenus et ventes par service</h2>
            <p className="text-xs text-slate-500">
              Cliquez sur un service pour afficher le détail des ventes et la liste des transactions correspondantes.
            </p>
          </div>
          <span className="text-xs font-medium text-[#332E86] inline-flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />
            Vue interactive
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {byService.map((srv) => (
            <button
              key={srv.serviceId}
              type="button"
              onClick={() => openServiceDetails(srv)}
              className="glass-panel rounded-2xl p-5 text-left hover:border-[#332E86]/50 hover:-translate-y-0.5 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-slate-900 group-hover:text-[#332E86] transition-colors">
                    {srv.serviceName}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    Tarif catalogue actuel : {formatAriary(srv.currentPrice)}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-[#332E86] shrink-0 mt-1" />
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200/80 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Revenu encaissé</div>
                  <div className="text-lg font-bold text-[#332E86] tabular-nums mt-0.5">
                    {formatAriary(srv.confirmedRevenue)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Transactions</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {srv.totalSalesCount}
                  </div>
                </div>
              </div>

              {srv.pendingCount > 0 && (
                <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 tabular-nums">
                  {srv.pendingCount} en attente ({formatAriary(srv.pendingAmount)})
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Monitoring */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#332E86]" />
            <h2 className="text-base font-bold text-slate-900">Suivi des opérations par employé</h2>
          </div>
          <span className="text-xs text-slate-500">{byAgent.length} compte(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Employé</th>
                <th className="py-3 px-4">Rôle</th>
                <th className="py-3 px-4 text-right">Transactions</th>
                <th className="py-3 px-4 text-right">Encaissées</th>
                <th className="py-3 px-4 text-right">En attente</th>
                <th className="py-3 px-4 text-right">Montant encaissé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {byAgent.map((ag) => (
                <tr key={ag.agentId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{ag.agentName}</div>
                    <div className="text-xs text-slate-500">@{ag.agentUsername}</div>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-700">
                    {ag.agentRole === 'SUPERVISOR' ? 'Superviseur' : 'Agent de guichet'}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums">
                    {ag.totalTransactions}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-700 font-medium tabular-nums">
                    {ag.completedCount}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700 font-medium tabular-nums">
                    {ag.pendingCount}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-[#332E86] tabular-nums whitespace-nowrap">
                    {formatAriary(ag.confirmedRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Historique récent des transactions</h2>
          <span className="text-xs text-slate-500 tabular-nums">{transactions.length} résultat(s)</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement des transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Aucune transaction ne correspond aux critères sélectionnés.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
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
                    <td className="py-3 px-4 text-slate-800 whitespace-nowrap">{tx.serviceName}</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatAriary(tx.priceAtTransaction)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">{tx.agentName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
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
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-[#332E86] hover:border-[#332E86]/40 cursor-pointer"
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
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-[#332E86] cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedServiceDetail.serviceName}</h3>
                <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                  {selectedServiceDetail.totalSalesCount} vente(s) · Chiffre d’affaires encaissé :{' '}
                  <strong className="text-[#332E86]">{formatAriary(selectedServiceDetail.confirmedRevenue)}</strong>
                  {selectedServiceDetail.pendingCount > 0 &&
                    ` · ${selectedServiceDetail.pendingCount} en attente (${formatAriary(selectedServiceDetail.pendingAmount)})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedServiceDetail(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {loadingServiceDetail ? (
                <div className="py-10 text-center text-sm text-slate-500">Chargement des transactions...</div>
              ) : serviceDetailTxs.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Aucune transaction enregistrée pour ce service sur la période filtrée.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 pr-3">Référence</th>
                      <th className="py-2.5 px-3">Étudiant</th>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3 text-right">Tarif appliqué</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Paiement</th>
                      <th className="py-2.5 pl-3">Production</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serviceDetailTxs.map((tx) => (
                      <tr key={tx.id} onClick={() => setInspectTx(tx)} className="cursor-pointer hover:bg-slate-50">
                        <td className="py-2.5 pr-3 font-mono-ref text-xs font-semibold text-[#332E86]">
                          {tx.reference}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900">
                            {tx.studentNom} {tx.studentPrenom}
                          </div>
                          <div className="text-xs text-slate-500 font-mono-ref">{tx.studentMatricule}</div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-700">{tx.agentName}</td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                          {formatAriary(tx.priceAtTransaction)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 tabular-nums">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Détail de la transaction</h3>
                <p className="text-xs font-mono-ref text-[#332E86] font-semibold">{inspectTx.reference}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectTx(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Prestation</span>
                <span className="font-semibold text-slate-900">{inspectTx.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Prix historique appliqué</span>
                <span className="font-bold text-[#332E86] tabular-nums">
                  {formatAriary(inspectTx.priceAtTransaction)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Étudiant</span>
                <span className="font-medium text-slate-900">
                  {inspectTx.studentNom} {inspectTx.studentPrenom} ({inspectTx.studentMatricule})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Promotion</span>
                <span className="text-slate-800">{inspectTx.studentPromotion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Opérateur</span>
                <span className="text-slate-800">{inspectTx.agentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date de création</span>
                <span className="text-slate-800 tabular-nums">{formatDateTime(inspectTx.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500">Statut &amp; Paiement</span>
                <div className="flex gap-1.5">
                  <TransactionStatusBadge status={inspectTx.status} />
                  <PaymentStatusBadge paymentStatus={inspectTx.paymentStatus} />
                </div>
              </div>
              {inspectTx.paymentConfirmedAt && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Paiement confirmé par</span>
                  <span>
                    {inspectTx.paymentConfirmedByName} ({formatDateTime(inspectTx.paymentConfirmedAt)})
                  </span>
                </div>
              )}
              {getServiceFields(inspectTx.serviceCode).map((f) =>
                inspectTx.details?.[f.key] ? (
                  <div key={f.key} className="flex justify-between">
                    <span className="text-slate-500">{f.label.replace(' (optionnel)', '')}</span>
                    <span className="text-slate-800 text-right">
                      {f.options?.find((o) => o.value === inspectTx.details[f.key])?.label ?? inspectTx.details[f.key]}
                    </span>
                  </div>
                ) : null
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Production</span>
                <ProductionStatusBadge status={inspectTx.productionStatus} />
              </div>
              {inspectTx.documentReference && inspectTx.productionId && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Document</span>
                  <button
                    type="button"
                    onClick={() => setPreviewProductionId(inspectTx.productionId)}
                    className="font-mono-ref text-xs font-semibold text-[#332E86] hover:underline cursor-pointer"
                  >
                    {inspectTx.documentReference}
                  </button>
                </div>
              )}
              {inspectTx.notes && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                  <strong className="block text-slate-900 mb-0.5">Observations :</strong>
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

            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Historique des actions</h4>
              <TransactionTimeline transactionId={inspectTx.id} refreshKey={historyKey} />
            </div>
          </div>
        </div>
      )}

      {/* Cancel Transaction Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCancelSubmit} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Annuler la transaction</h3>
            <p className="text-sm text-slate-600">
              Référence <strong className="font-mono-ref text-[#332E86]">{cancelTarget.reference}</strong> —{' '}
              {formatAriary(cancelTarget.priceAtTransaction)}. L’opération restera conservée dans le journal d’audit.
            </p>
            {actionError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="cancel-reason">
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
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCorrectSubmit} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Corriger la transaction</h3>
              <p className="text-xs text-slate-600 mt-1">
                L’opération <span className="font-mono-ref font-semibold">{correctTarget.reference}</span> sera annulée
                et remplacée par une nouvelle écriture tracée dans le journal d’audit.
              </p>
            </div>
            {actionError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="corr-srv">
                Nouvelle prestation
              </label>
              <select
                id="corr-srv"
                value={correctServiceId}
                onChange={(e) => setCorrectServiceId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
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
            <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={correctPaid}
                onChange={(e) => setCorrectPaid(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#332E86]"
              />
              Paiement encaissé confirmé
            </label>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="corr-reason">
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
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="rounded-xl bg-[#332E86] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 cursor-pointer"
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
