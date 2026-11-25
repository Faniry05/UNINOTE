import type { ServiceItem } from '../types/scolarite';
import { apiClient } from './client';

export interface CreateServicePayload {
  name: string;
  description: string;
  price: number;
  isActive?: boolean;
}

export interface UpdateServicePayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export const catalogService = {
  async getServices(includeInactive = true): Promise<ServiceItem[]> {
    const res = await apiClient.get<{ services: ServiceItem[] }>('/scolarite/services', {
      includeInactive: includeInactive ? 'true' : 'false',
    });
    return res.services;
  },

  async getServiceById(id: string): Promise<ServiceItem> {
    const res = await apiClient.get<{ service: ServiceItem }>(`/scolarite/services/${encodeURIComponent(id)}`);
    return res.service;
  },

  async createService(payload: CreateServicePayload): Promise<ServiceItem> {
    const res = await apiClient.post<{ service: ServiceItem }>('/scolarite/services', payload);
    return res.service;
  },

  async updateService(id: string, payload: UpdateServicePayload): Promise<ServiceItem> {
    const res = await apiClient.patch<{ service: ServiceItem }>(`/scolarite/services/${encodeURIComponent(id)}`, payload);
    return res.service;
  },

  async updateServicePrice(id: string, price: number): Promise<ServiceItem> {
    const res = await apiClient.patch<{ service: ServiceItem }>(
      `/scolarite/services/${encodeURIComponent(id)}/price`,
      { price }
    );
    return res.service;
  },
};
