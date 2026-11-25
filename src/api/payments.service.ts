import type { Payment, ServiceTransaction } from '../types/scolarite';
import { apiClient } from './client';

export const paymentsService = {
  /**
   * Records the cash payment of a pending sale (the agent confirms that the
   * cash was received). The server also creates the production request.
   */
  async recordCashPayment(data: { transactionId: string; amountReceived?: number }): Promise<ServiceTransaction> {
    const res = await apiClient.post<{ transaction: ServiceTransaction }>(
      `/scolarite/transactions/${encodeURIComponent(data.transactionId)}/confirm-payment`,
      data.amountReceived !== undefined ? { amountReceived: data.amountReceived } : undefined
    );
    return res.transaction;
  },

  async getPaymentByTransaction(transactionId: string): Promise<Payment | null> {
    const res = await apiClient.get<{ payment: Payment | null }>(
      `/scolarite/transactions/${encodeURIComponent(transactionId)}/payment`
    );
    return res.payment;
  },
};
