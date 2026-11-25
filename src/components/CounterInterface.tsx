import { useEffect, useState, type FormEvent } from 'react';
import {
  FileText,
  Award,
  BadgeCheck,
  Search,
  UserCheck,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Banknote,
  Clock,
  Receipt,
  Loader2,
} from 'lucide-react';
import { catalogService } from '../api/catalog.service';
import { studentsService } from '../api/students.service';
import { transactionsService } from '../api/transactions.service';
import type { ServiceItem, ServiceTransaction, Student, User } from '../types/scolarite';
import { formatAriary, formatDateTime } from '../utils/format';
import { PaymentStatusBadge, TransactionStatusBadge } from './StatusBadge';

interface CounterInterfaceProps {
  currentUser: User;
}

function getServiceIcon(code: string) {
  if (code.includes('RELEVE')) return FileText;
  if (code.includes('ATTESTATION')) return Award;
  return BadgeCheck;
}

export function CounterInterface({ currentUser }: CounterInterfaceProps) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);

  // Student lookup & form state
  const [matricule, setMatricule] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [promotion, setPromotion] = useState('');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');
  const [matchedStudent, setMatchedStudent] = useState<Student | null>(null);
  const [suggestions, setSuggestions] = useState<Student[]>([]);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [confirmedResult, setConfirmedResult] = useState<{
    transaction: ServiceTransaction;
    studentCreated: boolean;
  } | null>(null);
  const [confirmingReceiptPayment, setConfirmingReceiptPayment] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingServices(true);
      setLoadError(null);
      try {
        const list = await catalogService.getServices(false);
        if (active) {
          setServices(list.filter((s) => s.isActive));
        }
      } catch (err) {
        if (active) {
          setLoadError(err instanceof Error ? err.message : 'Impossible de charger les prestations.');
        }
      } finally {
        if (active) setLoadingServices(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  function resetFormForNewOperation(keepService = false) {
    if (!keepService) {
      setSelectedService(null);
    }
    setMatricule('');
    setNom('');
    setPrenom('');
    setPromotion('');
    setContact('');
    setNotes('');
    setPaymentConfirmed(false);
    setLookupState('idle');
    setMatchedStudent(null);
    setSuggestions([]);
    setSubmitError(null);
    setShowConfirmModal(false);
    setConfirmedResult(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function handleSelectService(service: ServiceItem) {
    setSelectedService(service);
    setConfirmedResult(null);
    setSubmitError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  async function handleLookupMatricule(explicitMatricule?: string) {
    const target = (explicitMatricule ?? matricule).trim().toUpperCase();
    if (target.length < 2) {
      setLookupState('idle');
      setMatchedStudent(null);
      return;
    }

    setLookupState('searching');
    setSubmitError(null);
    try {
      const student = await studentsService.getStudentByMatricule(target);
      setMatchedStudent(student);
      setMatricule(student.matricule);
      setNom(student.nom);
      setPrenom(student.prenom);
      setPromotion(student.promotion);
      setContact(student.contact || '');
      setLookupState('found');
      setSuggestions([]);
    } catch {
      setMatchedStudent(null);
      setLookupState('not_found');
    }
  }

  async function handleMatriculeChange(value: string) {
    setMatricule(value);
    if (matchedStudent && value.trim().toUpperCase() !== matchedStudent.matricule) {
      setMatchedStudent(null);
      setLookupState('idle');
    }
    if (value.trim().length >= 2) {
      try {
        const list = await studentsService.searchStudents(value.trim());
        setSuggestions(list.slice(0, 5));
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }

  function handleOpenConfirmation(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!selectedService) return;
    if (!matricule.trim() || !nom.trim() || !prenom.trim() || !promotion.trim()) {
      setSubmitError('Veuillez renseigner le matricule, le nom, le prénom et la promotion.');
      return;
    }
    setShowConfirmModal(true);
  }

  async function handleConfirmSubmit() {
    if (!selectedService || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await transactionsService.createTransaction({
        serviceId: selectedService.id,
        idempotencyKey,
        student: {
          matricule: matricule.trim().toUpperCase(),
          nom: nom.trim().toUpperCase(),
          prenom: prenom.trim(),
          promotion: promotion.trim(),
          contact: contact.trim(),
        },
        paymentConfirmed,
        notes: notes.trim(),
      });
      setShowConfirmModal(false);
      setConfirmedResult(res);
    } catch (err) {
      setShowConfirmModal(false);
      setSubmitError(err instanceof Error ? err.message : 'Échec de l’enregistrement de la prestation.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmPaymentOnReceipt() {
    if (!confirmedResult || confirmingReceiptPayment) return;
    setConfirmingReceiptPayment(true);
    setSubmitError(null);
    try {
      const updated = await transactionsService.confirmPayment(confirmedResult.transaction.id);
      setConfirmedResult({ ...confirmedResult, transaction: updated });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Impossible de confirmer l’encaissement.');
    } finally {
      setConfirmingReceiptPayment(false);
    }
  }

  const todayDisplay = formatDateTime(new Date().toISOString());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">Guichet Scolarité</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Nouvelle prestation</h1>
          <p className="text-sm text-slate-600 mt-1">
            Sélectionnez un service administratif pour enregistrer rapidement la demande d’un étudiant.
          </p>
        </div>

        <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center gap-3 self-start">
          <div className="text-right">
            <div className="text-xs text-slate-500">Agent connecté</div>
            <div className="text-sm font-semibold text-slate-900">{currentUser.fullName}</div>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Confirmation Screen */}
      {confirmedResult ? (
        <div className="glass-panel rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Prestation enregistrée avec succès</h2>
                <p className="text-sm text-slate-600">
                  Référence d’opération :{' '}
                  <span className="font-mono-ref font-semibold text-[#332E86]">
                    {confirmedResult.transaction.reference}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TransactionStatusBadge status={confirmedResult.transaction.status} />
              <PaymentStatusBadge paymentStatus={confirmedResult.transaction.paymentStatus} />
            </div>
          </div>

          {submitError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {confirmedResult.transaction.paymentStatus !== 'PAID' && (
            <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
                <div>
                  <div className="font-semibold">Encaissement non encore confirmé</div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    Ce reçu indique l’enregistrement de la demande mais ne vaut pas preuve de paiement en espèces tant que
                    l’encaissement n’est pas confirmé.
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={confirmingReceiptPayment}
                onClick={handleConfirmPaymentOnReceipt}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#332E86] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Banknote className="h-3.5 w-3.5" />
                {confirmingReceiptPayment ? 'Confirmation...' : 'Confirmer encaissement'}
              </button>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50/80 border border-slate-200 p-5">
            <div>
              <div className="text-xs text-slate-500">Prestation</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {confirmedResult.transaction.serviceName}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tarif appliqué</div>
              <div className="text-base font-bold text-[#332E86] tabular-nums mt-0.5">
                {formatAriary(confirmedResult.transaction.priceAtTransaction)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Étudiant</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {confirmedResult.transaction.studentNom} {confirmedResult.transaction.studentPrenom}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Matricule : <span className="font-mono-ref">{confirmedResult.transaction.studentMatricule}</span> ·{' '}
                {confirmedResult.transaction.studentPromotion}
                {confirmedResult.studentCreated ? ' (Nouveau dossier créé)' : ''}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Traçabilité</div>
              <div className="text-sm font-medium text-slate-900 mt-0.5">
                Agent : {confirmedResult.transaction.agentName}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {formatDateTime(confirmedResult.transaction.createdAt)}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => resetFormForNewOperation(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Choisir un autre service
            </button>

            <button
              type="button"
              onClick={() => resetFormForNewOperation(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#332E86] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#28246b] cursor-pointer"
            >
              <Receipt className="h-4 w-4" />
              Nouvelle opération ({confirmedResult.transaction.serviceName})
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Step 1: Large Clickable Service Cards */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">1. Sélectionner une prestation</h2>
            {loadingServices ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-36 rounded-2xl bg-white/80 border border-slate-200 animate-pulse p-5" />
                ))}
              </div>
            ) : services.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center text-sm text-slate-600">
                Aucun service actif disponible dans le catalogue. Contactez un superviseur.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {services.map((service) => {
                  const Icon = getServiceIcon(service.code);
                  const isSelected = selectedService?.id === service.id;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => handleSelectService(service)}
                      className={`text-left rounded-2xl p-5 transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-[#332E86] text-white border-[#332E86] shadow-lg shadow-[#332E86]/20'
                          : 'glass-panel text-slate-900 hover:border-[#332E86]/45 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-white/15 text-white' : 'bg-[#332E86]/10 text-[#332E86]'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <span
                          className={`text-lg font-bold tabular-nums whitespace-nowrap ${
                            isSelected ? 'text-white' : 'text-[#332E86]'
                          }`}
                        >
                          {formatAriary(service.price)}
                        </span>
                      </div>
                      <div className="mt-4">
                        <div className="text-base font-semibold">{service.name}</div>
                        <p
                          className={`text-xs mt-1 line-clamp-2 ${
                            isSelected ? 'text-indigo-100' : 'text-slate-600'
                          }`}
                        >
                          {service.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Student Form + Summary */}
          {selectedService && (
            <form onSubmit={handleOpenConfirmation} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">2. Identification de l’étudiant</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Recherchez d’abord par matricule pour éviter toute duplication de dossier étudiant.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resetFormForNewOperation(false)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>

                {submitError && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-sm text-rose-800">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Matricule Lookup */}
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="stu-matricule">
                    Matricule étudiant *
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        id="stu-matricule"
                        type="text"
                        required
                        value={matricule}
                        onChange={(e) => handleMatriculeChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleLookupMatricule();
                          }
                        }}
                        placeholder="Ex. 2024-INF-001"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono-ref uppercase text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLookupMatricule()}
                      disabled={lookupState === 'searching'}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {lookupState === 'searching' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      Rechercher
                    </button>
                  </div>

                  {suggestions.length > 0 && !matchedStudent && (
                    <div className="mt-1.5 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleLookupMatricule(s.matricule)}
                          className="w-full text-left px-3.5 py-2 text-xs hover:bg-indigo-50/70 flex items-center justify-between border-b last:border-b-0 border-slate-100 cursor-pointer"
                        >
                          <span>
                            <strong className="font-mono-ref text-[#332E86]">{s.matricule}</strong> — {s.nom}{' '}
                            {s.prenom}
                          </span>
                          <span className="text-slate-500">{s.promotion}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {lookupState === 'found' && matchedStudent && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                      <UserCheck className="h-4 w-4 shrink-0" />
                      <span>
                        Étudiant existant trouvé dans la base UniNotes ({matchedStudent.matricule}) — aucun doublon ne
                        sera créé.
                      </span>
                    </div>
                  )}

                  {lookupState === 'not_found' && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-[#332E86]">
                      <UserPlus className="h-4 w-4 shrink-0" />
                      <span>
                        Matricule non trouvé : renseignez les champs ci-dessous pour enregistrer cet étudiant
                        simultanément.
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="stu-nom">
                      Nom *
                    </label>
                    <input
                      id="stu-nom"
                      type="text"
                      required
                      readOnly={Boolean(matchedStudent)}
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      placeholder="Nom de famille"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm uppercase focus:outline-none ${
                        matchedStudent
                          ? 'border-slate-200 bg-slate-100 text-slate-700'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-[#332E86] focus:ring-2 focus:ring-[#332E86]/20'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="stu-prenom">
                      Prénom *
                    </label>
                    <input
                      id="stu-prenom"
                      type="text"
                      required
                      readOnly={Boolean(matchedStudent)}
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      placeholder="Prénom(s)"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
                        matchedStudent
                          ? 'border-slate-200 bg-slate-100 text-slate-700'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-[#332E86] focus:ring-2 focus:ring-[#332E86]/20'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="stu-promo">
                      Promotion *
                    </label>
                    <input
                      id="stu-promo"
                      type="text"
                      required
                      readOnly={Boolean(matchedStudent)}
                      value={promotion}
                      onChange={(e) => setPromotion(e.target.value)}
                      placeholder="Ex. L3 Informatique"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
                        matchedStudent
                          ? 'border-slate-200 bg-slate-100 text-slate-700'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-[#332E86] focus:ring-2 focus:ring-[#332E86]/20'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="stu-contact">
                      Contact (optionnel)
                    </label>
                    <input
                      id="stu-contact"
                      type="text"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="Téléphone ou email"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="tx-notes">
                    Observation guichet (optionnel)
                  </label>
                  <input
                    id="tx-notes"
                    type="text"
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex. Semestre S5 demandé, 2 exemplaires..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                  />
                </div>
              </div>

              {/* Right Column: Live Summary & Confirmation Trigger */}
              <div className="glass-panel rounded-2xl p-6 space-y-5">
                <h2 className="text-base font-semibold text-slate-900 border-b border-slate-200/80 pb-3">
                  Récapitulatif de l’opération
                </h2>

                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500">Service sélectionné</span>
                    <span className="font-semibold text-slate-900 text-right">{selectedService.name}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500">Identité étudiant</span>
                    <span className="font-medium text-slate-900 text-right">
                      {nom || prenom ? `${nom.toUpperCase()} ${prenom}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500">Matricule</span>
                    <span className="font-mono-ref text-slate-800">{matricule ? matricule.toUpperCase() : '—'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500">Date d’opération</span>
                    <span className="text-slate-800 tabular-nums text-right">{todayDisplay}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex items-baseline justify-between">
                    <span className="font-medium text-slate-700">Tarif applicable</span>
                    <span className="text-2xl font-bold text-[#332E86] tabular-nums">
                      {formatAriary(selectedService.price)}
                    </span>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paymentConfirmed}
                    onChange={(e) => setPaymentConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#332E86] focus:ring-[#332E86]"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    <strong className="block text-slate-900">Encaissement espèces confirmé au guichet</strong>
                    Cochez uniquement si le règlement en Ariary a été physiquement perçu. Sinon, l’opération sera
                    enregistrée en attente de confirmation.
                  </span>
                </label>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#332E86] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#28246b] transition-colors cursor-pointer"
                >
                  Confirmer la prestation
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* Confirmation Dialog */}
      {showConfirmModal && selectedService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-tx-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5">
            <div>
              <h3 id="confirm-tx-title" className="text-lg font-bold text-slate-900">
                Confirmer l’enregistrement
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Vérifiez les informations avant de générer la référence officielle.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Service</span>
                <span className="font-semibold text-slate-900">{selectedService.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Étudiant</span>
                <span className="font-semibold text-slate-900">
                  {nom.toUpperCase()} {prenom} ({matricule.toUpperCase()})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Montant appliqué</span>
                <span className="font-bold text-[#332E86] tabular-nums">{formatAriary(selectedService.price)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Statut paiement</span>
                <span className="font-medium text-slate-900">
                  {paymentConfirmed ? 'Encaissement confirmé' : 'En attente de règlement'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Modifier
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSubmit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#332E86] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 cursor-pointer"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Enregistrement...' : 'Valider l’opération'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
