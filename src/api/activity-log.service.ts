import type { ActivityLogEntry } from '../types/scolarite';
import { apiClient } from './client';

export interface ActivityLogFilters {
  entityType?: string;
  action?: string;
  userId?: string;
  limit?: number;
}

export const activityLogService = {
  async getActivityHistory(filters: ActivityLogFilters = {}): Promise<ActivityLogEntry[]> {
    const res = await apiClient.get<{ logs: ActivityLogEntry[] }>('/scolarite/activity-logs', {
      entityType: filters.entityType,
      action: filters.action,
      userId: filters.userId,
      limit: filters.limit,
    });
    return res.logs;
  },
};
