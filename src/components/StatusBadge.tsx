import { CheckCircle2, Clock, XCircle, Banknote, AlertCircle, FileClock, Hammer, PackageCheck, HandHeart } from 'lucide-react';
import type { PaymentStatus, ProductionStatus, TransactionStatus } from '../types/scolarite';

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Validée
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        En attente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 border border-rose-200 whitespace-nowrap">
      <XCircle className="h-3.5 w-3.5 shrink-0" />
      Annulée
    </span>
  );
}

export function PaymentStatusBadge({ paymentStatus }: { paymentStatus: PaymentStatus }) {
  if (paymentStatus === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-peach/70 px-2.5 py-1 text-xs font-medium text-ink border border-amber/40 whitespace-nowrap">
        <Banknote className="h-3.5 w-3.5 shrink-0" />
        Payé (espèces)
      </span>
    );
  }
  if (paymentStatus === 'REFUNDED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-panel px-2.5 py-1 text-xs font-medium text-ink/80 border border-ink/10 whitespace-nowrap">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Paiement annulé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50/70 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200/80 whitespace-nowrap">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      Non encaissé
    </span>
  );
}

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  A_PRODUIRE: 'À produire',
  EN_PRODUCTION: 'En production',
  PRET: 'Prêt',
  REMIS: 'Remis',
};

const PRODUCTION_STYLES: Record<ProductionStatus, { cls: string; Icon: typeof Clock }> = {
  A_PRODUIRE: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: FileClock },
  EN_PRODUCTION: { cls: 'bg-sky-50 text-sky-800 border-sky-200', Icon: Hammer },
  PRET: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: PackageCheck },
  REMIS: { cls: 'bg-panel text-ink/80 border-ink/10', Icon: HandHeart },
};

export function ProductionStatusBadge({ status }: { status: ProductionStatus | null | undefined }) {
  if (!status) {
    return <span className="text-xs text-ink/40 whitespace-nowrap">Pas de production</span>;
  }
  const { cls, Icon } = PRODUCTION_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border whitespace-nowrap ${cls}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {PRODUCTION_STATUS_LABELS[status]}
    </span>
  );
}
