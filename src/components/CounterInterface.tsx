import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  FileText,
  Hammer,
  Loader2,
  Search,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { getServiceFields } from '../../shared/service-forms';
import { catalogService } from '../api/catalog.service';
import { ApiError } from '../api/client';
import { paymentsService } from '../api/payments.service';
import { productionService } from '../api/production.service';
import { studentsService } from '../api/students.service';
import { transactionsService } from '../api/transactions.service';
import type { ServiceItem, ServiceTransaction, Student, User } from '../types/scolarite';
import { Chip, PageHeader } from '../ui/PageHeader';
import { formatAriary, formatDateTime } from '../utils/format';
import { PaymentStatusBadge, ProductionStatusBadge } from './StatusBadge';

interface CounterInterfaceProps {
  currentUser: User;
  onOpenProduction?: (productionId: string) => void;
}

function getServiceIcon(code: string) {
  if (code.includes('RELEVE')) return FileText;
  if (code.includes('ATTESTATION')) return Award;
  return BadgeCheck;
}

/** Current academic year: from September, 2026 → "2026-2027". */
function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function defaultDetails(service: ServiceItem | null): Record<string, string> {
  if (!service) return {};
  const init: Record<string, string> = {};
  for (const f of getServiceFields(service.code)) {
    if (f.key === 'academicYear') init[f.key] = currentAcademicYear();
    if (f.type === 'number') init[f.key] = '1';
    if (f.type === 'select' && f.options?.[0]) init[f.key] = f.options[0].value;
  }
  return init;
}

interface SaleResult {
  transaction: ServiceTransaction;
  studentCreated: boolean;
  duplicate?: boolean;
}

const EMPTY_STUDENT = { matricule: '', nom: '', prenom: '', promotion: '', contact: '' };

/**
 * Counter screen (agent). Fast path: pick an offer (click or keys 1–3),
 * find the student (matricule or name), check the pre-filled details, then
 * one button records the sale, the cash payment and the production request.
 */
export function CounterInterface({ currentUser, onOpenProduction }: CounterInterfaceProps) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [toProduce, setToProduce] = useState<number | null>(null);

  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [newStudentMode, setNewStudentMode] = useState(false);
  const [newStudent, setNewStudent] = useState(EMPTY_STUDENT);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState<'paid' | 'unpaid' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const newSaleRef = useRef<HTMLButtonElement>(null);

  const firstName = currentUser.fullName.split(' ')[0];

  async function refreshAgentStats() {
    try {
      const [today, pending] = await Promise.all([
        transactionsService.getTransactions({ period: 'today' }),
        productionService.getProductionRequests({ productionStatus: 'A_PRODUIRE' }),
      ]);
      setTodayCount(today.filter((t) => t.status !== 'CANCELLED').length);
      setToProduce(pending.filter((p) => p.transactionStatus !== 'CANCELLED').length);
    } catch {
      // Indicators are informative only.
    }
  }

  useEffect(() => {
    let active = true;
    catalogService
      .getServices(false)
      .then((list) => active && setServices(list.filter((s) => s.isActive)))
      .catch((err) => active && setLoadError(err instanceof Error ? err.message : 'Impossible de charger les prestations.'))
      .finally(() => active && setLoadingServices(false));
    refreshAgentStats();
    return () => {
      active = false;
    };
  }, []);

  // Keyboard: 1–3 pick an offer, Escape clears the current sale.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (e.key === 'Escape' && !result && selected) {
        resetSale(false);
        return;
      }
      if (typing || result || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= services.length) {
        e.preventDefault();
        selectService(services[n - 1]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Live student search (matricule or name), debounced.
  useEffect(() => {
    if (student || newStudentMode) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      studentsService
        .searchStudents(q)
        .then((list) => setSuggestions(list.slice(0, 6)))
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [query, student, newStudentMode]);

  useEffect(() => {
    if (result) newSaleRef.current?.focus();
  }, [result]);

  function selectService(service: ServiceItem) {
    setSelected(service);
    setDetails(defaultDetails(service));
    setError(null);
    setResult(null);
    setIdempotencyKey(crypto.randomUUID());
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function resetSale(keepService: boolean) {
    if (!keepService) setSelected(null);
    setQuery('');
    setSuggestions([]);
    setStudent(null);
    setNewStudentMode(false);
    setNewStudent(EMPTY_STUDENT);
    setDetails(defaultDetails(keepService ? selected : null));
    setNotes('');
    setError(null);
    setResult(null);
    setIdempotencyKey(crypto.randomUUID());
    if (keepService) requestAnimationFrame(() => searchRef.current?.focus());
  }

  function pickStudent(s: Student) {
    setStudent(s);
    setSuggestions([]);
    setQuery('');
    setNewStudentMode(false);
  }

  async function handleSearchEnter() {
    if (suggestions.length > 0) {
      pickStudent(suggestions[0]);
      return;
    }
    const q = query.trim().toUpperCase();
    if (q.length < 2) return;
    try {
      pickStudent(await studentsService.getStudentByMatricule(q));
    } catch {
      startNewStudent();
    }
  }

  function startNewStudent() {
    const q = query.trim();
    setNewStudentMode(true);
    setStudent(null);
    setSuggestions([]);
    setNewStudent({ ...EMPTY_STUDENT, matricule: /\d/.test(q) ? q.toUpperCase() : '' });
  }

  const beneficiary = student
    ? { matricule: student.matricule, nom: student.nom, prenom: student.prenom, promotion: student.promotion, contact: student.contact }
    : newStudentMode
      ? newStudent
      : null;

  const fields = useMemo(() => (selected ? getServiceFields(selected.code) : []), [selected]);
  const missingField = fields.find((f) => f.required && !details[f.key]?.trim());
  const beneficiaryReady = Boolean(
    beneficiary &&
      beneficiary.matricule.trim().length >= 2 &&
      beneficiary.nom.trim() &&
      beneficiary.prenom.trim() &&
      beneficiary.promotion.trim()
  );
  const canSubmit = Boolean(selected && beneficiaryReady && !missingField && !submitting);

  async function submitSale(paid: boolean) {
    if (!selected || !beneficiary || !canSubmit) return;
    setSubmitting(paid ? 'paid' : 'unpaid');
    setError(null);
    try {
      const res = await transactionsService.createTransaction({
        serviceId: selected.id,
        idempotencyKey,
        student: {
          matricule: beneficiary.matricule.trim().toUpperCase(),
          nom: beneficiary.nom.trim().toUpperCase(),
          prenom: beneficiary.prenom.trim(),
          promotion: beneficiary.promotion.trim(),
          contact: beneficiary.contact.trim(),
        },
        paymentConfirmed: paid,
        amountReceived: paid ? selected.price : undefined,
        expectedPrice: selected.price,
        details,
        notes: notes.trim(),
      });
      setResult(res);
      refreshAgentStats();
    } catch (err) {
      // Double submission (double click, network retry): the server returns the
      // sale already recorded with this idempotency key instead of a new one.
      const payload = err instanceof ApiError ? (err.details as { duplicate?: boolean; transaction?: ServiceTransaction }) : null;
      if (err instanceof ApiError && err.status === 409 && payload?.duplicate && payload.transaction) {
        setResult({ transaction: payload.transaction, studentCreated: false, duplicate: true });
        return;
      }
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement de la vente.');
    } finally {
      setSubmitting(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitSale(true);
  }

  async function confirmPaymentLater() {
    if (!result || confirmingPayment) return;
    setConfirmingPayment(true);
    setError(null);
    try {
      const updated = await paymentsService.recordCashPayment({
        transactionId: result.transaction.id,
        amountReceived: result.transaction.priceAtTransaction,
      });
      setResult({ ...result, transaction: updated });
      refreshAgentStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de confirmer l’encaissement.');
    } finally {
      setConfirmingPayment(false);
    }
  }

  const detailSummary = fields
    .filter((f) => details[f.key])
    .map((f) => f.options?.find((o) => o.value === details[f.key])?.label ?? details[f.key]);

  return (
    <div className="space-y-[18px]">
      <PageHeader
        trail={['Scolarité', 'Guichet']}
        title={`Bonjour, ${firstName}`}
        chips={
          <>
            <Chip icon={<Banknote className="h-3 w-3" />}>{todayCount ?? '—'} vente(s) aujourd’hui</Chip>
            <Chip icon={<Hammer className="h-3 w-3" />}>{toProduce ?? '—'} document(s) à produire</Chip>
          </>
        }
      />

      {loadError && <ErrorLine message={loadError} />}

      {/* Offers: one click (or key 1–3) starts the sale */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[9px]">
        {loadingServices
          ? [1, 2, 3].map((i) => <div key={i} className="card h-[150px] rounded-2xl animate-pulse" />)
          : services.map((service, index) => {
              const Icon = getServiceIcon(service.code);
              const isSelected = selected?.id === service.id;
              return (
                <button
                  key={service.id}
                  type="button"
                  data-enter="rise"
                  onClick={() => selectService(service)}
                  aria-pressed={isSelected}
                  className={`card rounded-2xl p-[18px] text-left cursor-pointer transition-all hover:-translate-y-0.5 ${
                    isSelected ? '!bg-amber-light' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="card-label">{service.name}</span>
                    {index < 9 && (
                      <kbd className="mono text-[10.5px] rounded-md bg-panel px-1.5 py-0.5 text-ink/60">{index + 1}</kbd>
                    )}
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="text-[44px] font-light leading-none tracking-[-0.04em] tabular-nums">
                      {formatAriary(service.price)}
                    </div>
                    <span className="icon-square h-10 w-10 shrink-0">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-3 text-[13px] text-ink/65 line-clamp-2">{service.description}</p>
                </button>
              );
            })}
      </div>

      {!loadingServices && services.length === 0 && !loadError && (
        <div className="card rounded-2xl p-8 text-center text-sm text-ink/70">
          Aucune prestation active dans le catalogue. Contactez le responsable.
        </div>
      )}

      {!selected && !result && !loadingServices && services.length > 0 && (
        <p className="scene-text text-[13px]">Choisissez une prestation (clic ou touches 1 à {services.length}).</p>
      )}

      {result ? (
        <SaleSuccess
          result={result}
          error={error}
          confirmingPayment={confirmingPayment}
          onConfirmPayment={confirmPaymentLater}
          onNewSale={() => resetSale(true)}
          onOtherService={() => resetSale(false)}
          onOpenProduction={onOpenProduction}
          newSaleRef={newSaleRef}
        />
      ) : (
        selected && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-[9px] items-start">
            {/* Beneficiary + request details */}
            <div className="card rounded-2xl p-[18px] space-y-5">
              <div className="flex items-center justify-between">
                <span className="card-label">Bénéficiaire</span>
                <button
                  type="button"
                  onClick={() => resetSale(false)}
                  className="mono text-[11px] text-ink/60 hover:text-ink cursor-pointer inline-flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Annuler (Échap)
                </button>
              </div>

              {!student && !newStudentMode && (
                <div>
                  <div className="relative">
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchEnter();
                        }
                      }}
                      placeholder="MATRICULE OU NOM DE L’ÉTUDIANT"
                      aria-label="Rechercher l’étudiant"
                      className="field h-[42px] pr-10 mono text-[13px] placeholder:text-ink/45"
                    />
                    {searching ? (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink/60" />
                    ) : (
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/60" />
                    )}
                  </div>
                  {suggestions.length > 0 && (
                    <div className="mt-1.5 panel overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pickStudent(s)}
                          className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center justify-between gap-3 hover:bg-amber-light/60 cursor-pointer ${
                            i > 0 ? 'border-t border-ink/10' : ''
                          }`}
                        >
                          <span>
                            <span className="font-mono-ref text-[12px]">{s.matricule}</span> · {s.nom} {s.prenom}
                          </span>
                          <span className="text-ink/60 text-[12px] truncate">{s.promotion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[12px] text-ink/60">
                    <span>Entrée = premier résultat</span>
                    <button type="button" onClick={startNewStudent} className="inline-flex items-center gap-1 hover:text-ink cursor-pointer">
                      <UserPlus className="h-3.5 w-3.5" /> Nouvel étudiant
                    </button>
                  </div>
                </div>
              )}

              {student && (
                <div className="panel p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="icon-square h-9 w-9 shrink-0">
                      <UserCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[16px] truncate">
                        {student.nom} {student.prenom}
                      </div>
                      <div className="font-mono-ref text-[11.5px] text-ink/65 truncate">
                        {student.matricule} · {student.promotion}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStudent(null);
                      requestAnimationFrame(() => searchRef.current?.focus());
                    }}
                    className="mono text-[11px] text-ink/60 hover:text-ink cursor-pointer shrink-0"
                  >
                    Changer
                  </button>
                </div>
              )}

              {newStudentMode && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="mono text-[11px] text-ink/65">Nouvel étudiant — dossier créé à la vente</span>
                    <button type="button" onClick={() => setNewStudentMode(false)} className="mono text-[11px] text-ink/60 hover:text-ink cursor-pointer">
                      Rechercher
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        ['matricule', 'Matricule *', 'Ex. 2025-INF-042'],
                        ['promotion', 'Promotion / parcours *', 'Ex. L3 Informatique'],
                        ['nom', 'Nom *', 'Nom de famille'],
                        ['prenom', 'Prénom *', 'Prénom(s)'],
                        ['contact', 'Contact', 'Téléphone (optionnel)'],
                      ] as const
                    ).map(([key, label, ph], i) => (
                      <label key={key} className="block">
                        <span className="mono text-[10.5px] text-ink/65">{label}</span>
                        <input
                          autoFocus={i === 0}
                          type="text"
                          value={newStudent[key]}
                          onChange={(e) => setNewStudent((ns) => ({ ...ns, [key]: e.target.value }))}
                          placeholder={ph}
                          className={`field mt-1 ${key === 'matricule' || key === 'nom' ? 'uppercase' : ''}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {fields.length > 0 && (
                <div className="space-y-3 border-t border-ink/10 pt-4">
                  <span className="card-label">Demande — {selected.name}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {fields.map((field) =>
                      field.type === 'select' ? (
                        <div key={field.key} className="sm:col-span-2">
                          <span className="mono text-[10.5px] text-ink/65">{field.label}</span>
                          <div className="tabbar mt-1" role="radiogroup" aria-label={field.label}>
                            {field.options?.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                role="radio"
                                aria-checked={details[field.key] === o.value}
                                data-active={details[field.key] === o.value}
                                onClick={() => setDetails((d) => ({ ...d, [field.key]: o.value }))}
                                className="tab flex-1 justify-center"
                              >
                                {o.label.replace('Attestation ', '')}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <label key={field.key} className="block">
                          <span className="mono text-[10.5px] text-ink/65">
                            {field.label}
                            {field.required ? ' *' : ''}
                          </span>
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            min={field.type === 'number' ? 1 : undefined}
                            max={field.type === 'number' ? 20 : undefined}
                            value={details[field.key] ?? ''}
                            onChange={(e) => setDetails((d) => ({ ...d, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="field mt-1"
                          />
                        </label>
                      )
                    )}
                    <label className="block sm:col-span-2">
                      <span className="mono text-[10.5px] text-ink/65">Observation (optionnel)</span>
                      <input
                        type="text"
                        maxLength={500}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ex. 2 exemplaires, urgent..."
                        className="field mt-1"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Recap + single confirmation */}
            <div className="card rounded-2xl p-[18px] space-y-3 lg:sticky lg:top-4">
              <span className="card-label">Récapitulatif</span>

              <div className="panel p-3.5 space-y-2 text-[13.5px]">
                <Row label="Prestation" value={selected.name} />
                <Row
                  label="Étudiant"
                  value={beneficiary && beneficiary.nom ? `${beneficiary.nom.toUpperCase()} ${beneficiary.prenom}` : '—'}
                />
                <Row label="Matricule" value={beneficiary?.matricule ? beneficiary.matricule.toUpperCase() : '—'} mono />
                {detailSummary.length > 0 && <Row label="Détails" value={detailSummary.join(' · ')} />}
                <Row label="Paiement" value="ESPÈCES" mono />
              </div>

              <div className="panel p-3.5 flex items-end justify-between gap-3">
                <span className="mono text-[11px] text-ink/65">Montant encaissé</span>
                <span className="text-[38px] font-light leading-none tracking-[-0.04em] tabular-nums">
                  {formatAriary(selected.price)}
                </span>
              </div>

              {error && <ErrorLine message={error} />}
              {!error && !beneficiaryReady && <p className="text-[12px] text-ink/60">Identifiez l’étudiant pour continuer.</p>}
              {!error && beneficiaryReady && missingField && (
                <p className="text-[12px] text-ink/60">Champ requis : {missingField.label}.</p>
              )}

              <button type="submit" disabled={!canSubmit} className="btn-ink w-full h-[48px]">
                {submitting === 'paid' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                {submitting === 'paid' ? 'Enregistrement…' : `Encaisser ${formatAriary(selected.price)} et lancer`}
              </button>
              <p className="text-[11.5px] leading-snug text-ink/55">
                En cliquant, vous déclarez avoir reçu les espèces. La vente, le paiement et la demande de production sont
                créés ensemble.
              </p>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => submitSale(false)}
                className="w-full mono text-[11px] text-ink/60 hover:text-ink disabled:opacity-40 cursor-pointer py-1"
              >
                {submitting === 'unpaid' ? 'Enregistrement…' : 'Enregistrer sans encaissement'}
              </button>
            </div>
          </form>
        )
      )}
    </div>
  );
}

function SaleSuccess({
  result,
  error,
  confirmingPayment,
  onConfirmPayment,
  onNewSale,
  onOtherService,
  onOpenProduction,
  newSaleRef,
}: {
  result: SaleResult;
  error: string | null;
  confirmingPayment: boolean;
  onConfirmPayment: () => void;
  onNewSale: () => void;
  onOtherService: () => void;
  onOpenProduction?: (productionId: string) => void;
  newSaleRef: RefObject<HTMLButtonElement | null>;
}) {
  const tx = result.transaction;
  return (
    <div className="card rounded-2xl p-[18px] grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-center">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center gap-3">
          <span className="icon-square h-11 w-11 shrink-0 !bg-emerald-100 !text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="card-label">{result.duplicate ? 'Vente déjà enregistrée' : 'Vente enregistrée'}</span>
            <div className="font-mono-ref text-[24px] sm:text-[28px] leading-tight break-all">{tx.reference}</div>
          </div>
        </div>
        {result.duplicate && <p className="text-[13px] text-ink/70">Double envoi détecté : aucune seconde vente n’a été créée.</p>}
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="chip">{tx.serviceName}</span>
          <span className="chip">{formatAriary(tx.priceAtTransaction)}</span>
          <span className="text-ink/75">
            {tx.studentNom} {tx.studentPrenom} · <span className="font-mono-ref text-[12px]">{tx.studentMatricule}</span>
            {result.studentCreated ? ' · nouveau dossier' : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PaymentStatusBadge paymentStatus={tx.paymentStatus} />
          <ProductionStatusBadge status={tx.productionStatus} />
          <span className="mono text-[10.5px] text-ink/55">{formatDateTime(tx.createdAt)}</span>
        </div>
        {error && <ErrorLine message={error} />}
      </div>

      <div className="flex flex-col gap-2 lg:w-[300px]">
        {tx.paymentStatus === 'UNPAID' && tx.status !== 'CANCELLED' && (
          <button type="button" onClick={onConfirmPayment} disabled={confirmingPayment} className="btn-amber h-[44px]">
            {confirmingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Encaisser {formatAriary(tx.priceAtTransaction)}
          </button>
        )}
        <button ref={newSaleRef} type="button" onClick={onNewSale} className="btn-ink h-[44px]">
          Nouvelle vente — {tx.serviceName}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOtherService}
            className="flex-1 panel h-[40px] mono text-[11px] hover:bg-amber-light cursor-pointer"
          >
            Autre prestation
          </button>
          {tx.productionId && onOpenProduction && (
            <button
              type="button"
              onClick={() => onOpenProduction(tx.productionId!)}
              className="flex-1 panel h-[40px] mono text-[11px] hover:bg-amber-light cursor-pointer inline-flex items-center justify-center gap-1"
            >
              Production <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink/60 shrink-0">{label}</span>
      <span className={`text-right ${mono ? 'font-mono-ref text-[12px]' : ''}`}>{value}</span>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-[13px] text-rose-800">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
