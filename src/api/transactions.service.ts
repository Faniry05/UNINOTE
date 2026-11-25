import type { ServiceTransaction, TransactionFilters } from '../types/scolarite';
import { apiClient } from './client';

export interface CreateTransactionPayload {
  serviceId: string;
  idempotencyKey: string;
  student: {
    matricule: string;
    nom: string;
    prenom: string;
    promotion: string;
    contact?: string;
  };
  paymentConfirmed: boolean;
  /** Cash amount the agent declares as received; validated by the server. */
  amountReceived?: number;
  /** Price shown to the agent; the server rejects the sale if it changed. */
  expectedPrice?: number;
  details?: Record<string, string>;
  notes?: string;
}

export interface CreateTransactionResponse {
  transaction: ServiceTransaction;
  studentCreated: boolean;
}

export interface CorrectTransactionPayload {
  reason: string;
  serviceId: string;
  paymentConfirmed: boolean;
  notes?: string;
}

export const transactionsService = {
  createTransaction(payload: CreateTransactionPayload): Promise<CreateTransactionResponse> {
    return apiClient.post<CreateTransactionResponse>('/scolarite/transactions', payload);
  },

  async getTransactions(filters: TransactionFilters = {}): Promise<ServiceTransaction[]> {
    const res = await apiClient.get<{ transactions: ServiceTransaction[] }>('/scolarite/transactions', {
      period: filters.period,
      startDate: filters.startDate,
      endDate: filters.endDate,
      serviceId: filters.serviceId,
      agentId: filters.agentId,
      status: filters.status,
      productionStatus: filters.productionStatus,
      search: filters.search,
    });
    return res.transactions;
  },

  async getTransactionById(id: string): Promise<ServiceTransaction> {
    const res = await apiClient.get<{ transaction: ServiceTransaction }>(
      `/scolarite/transactions/${encodeURIComponent(id)}`
    );
    return res.transaction;
  },

  async cancelTransaction(id: string, reason: string): Promise<ServiceTransaction> {
    const res = await apiClient.post<{ transaction: ServiceTransaction }>(
      `/scolarite/transactions/${encodeURIComponent(id)}/cancel`,
      { reason }
    );
    return res.transaction;
  },

  async correctTransaction(id: string, payload: CorrectTransactionPayload): Promise<ServiceTransaction> {
    const res = await apiClient.post<{ transaction: ServiceTransaction }>(
      `/scolarite/transactions/${encodeURIComponent(id)}/correct`,
      payload
    );
    return res.transaction;
  },
};
