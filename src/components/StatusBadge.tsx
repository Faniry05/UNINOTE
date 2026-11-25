import { CheckCircle2, Clock, XCircle, Banknote, AlertCircle } from 'lucide-react';
import type { PaymentStatus, TransactionStatus } from '../types/scolarite';

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
      <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-[#332E86] border border-indigo-200 whitespace-nowrap">
        <Banknote className="h-3.5 w-3.5 shrink-0" />
        Encaissé
      </span>
    );
  }
  if (paymentStatus === 'REFUNDED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 whitespace-nowrap">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Remboursé / Annulé
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
