import type { GeneratedDocument, ProductionFilters, ProductionRequest, ProductionStatus } from '../types/scolarite';
import { apiClient } from './client';

/**
 * Production requests are created by the server when a cash payment is
 * confirmed (see POST /scolarite/transactions and /confirm-payment); there is
 * no separate client-side creation call.
 */
export const productionService = {
  async getProductionRequests(filters: ProductionFilters = {}): Promise<ProductionRequest[]> {
    const res = await apiClient.get<{ productionRequests: ProductionRequest[] }>('/scolarite/production', {
      period: filters.period,
      startDate: filters.startDate,
      endDate: filters.endDate,
      serviceId: filters.serviceId,
      agentId: filters.agentId,
      productionStatus: filters.productionStatus,
      search: filters.search,
    });
    return res.productionRequests;
  },

  async getProductionRequestById(id: string): Promise<ProductionRequest> {
    const res = await apiClient.get<{ productionRequest: ProductionRequest }>(
      `/scolarite/production/${encodeURIComponent(id)}`
    );
    return res.productionRequest;
  },

  async updateProductionStatus(
    id: string,
    status: ProductionStatus,
    options: { verified?: boolean; deliveredTo?: string } = {}
  ): Promise<ProductionRequest> {
    const res = await apiClient.post<{ productionRequest: ProductionRequest }>(
      `/scolarite/production/${encodeURIComponent(id)}/status`,
      { status, ...options }
    );
    return res.productionRequest;
  },

  async regenerateDocument(id: string, reason: string): Promise<ProductionRequest> {
    const res = await apiClient.post<{ productionRequest: ProductionRequest }>(
      `/scolarite/production/${encodeURIComponent(id)}/regenerate`,
      { reason }
    );
    return res.productionRequest;
  },

  async getGeneratedDocument(id: string): Promise<GeneratedDocument> {
    const res = await apiClient.get<{ document: GeneratedDocument }>(
      `/scolarite/production/${encodeURIComponent(id)}/document`
    );
    return res.document;
  },
};
