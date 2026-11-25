import type {
  AgentSalesBreakdown,
  ProductionSummary,
  SalesSummary,
  ServiceSalesBreakdown,
  TransactionFilters,
} from '../types/scolarite';
import { apiClient } from './client';

export const salesDashboardService = {
  async getSalesSummary(filters: TransactionFilters = {}): Promise<SalesSummary> {
    const res = await apiClient.get<{ summary: SalesSummary }>('/scolarite/dashboard/summary', {
      period: filters.period,
      startDate: filters.startDate,
      endDate: filters.endDate,
      serviceId: filters.serviceId,
      agentId: filters.agentId,
    });
    return res.summary;
  },

  async getSalesByService(filters: TransactionFilters = {}): Promise<ServiceSalesBreakdown[]> {
    const res = await apiClient.get<{ byService: ServiceSalesBreakdown[] }>('/scolarite/dashboard/by-service', {
      period: filters.period,
      startDate: filters.startDate,
      endDate: filters.endDate,
      serviceId: filters.serviceId,
      agentId: filters.agentId,
    });
    return res.byService;
  },

  async getSalesByAgent(filters: TransactionFilters = {}): Promise<AgentSalesBreakdown[]> {
    const res = await apiClient.get<{ byAgent: AgentSalesBreakdown[] }>('/scolarite/dashboard/by-agent', {
      period: filters.period,
      startDate: filters.startDate,
      endDate: filters.endDate,
      serviceId: filters.serviceId,
    });
    return res.byAgent;
  },

  async getProductionSummary(filters: TransactionFilters = {}): Promise<ProductionSummary> {
    const res = await apiClient.get<{ productionSummary: ProductionSummary }>('/scolarite/dashboard/production-summary', {
      period: filters.period,
      startDate: filters.startDate,
      endDate: filters.endDate,
      serviceId: filters.serviceId,
      agentId: filters.agentId,
    });
    return res.productionSummary;
  },
};
