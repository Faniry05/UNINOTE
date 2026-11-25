export type UserRole = 'SUPERVISOR' | 'AGENT';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Student {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  promotion: string;
  contact: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentGrade {
  id: string;
  studentId: string;
  semester: string;
  courseCode: string;
  courseName: string;
  credits: number;
  grade: number;
  status: string;
}

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

export interface ServiceTransaction {
  id: string;
  reference: string;
  studentId: string;
  serviceId: string;
  performedByUserId: string;
  priceAtTransaction: number;
  status: TransactionStatus;
  paymentStatus: PaymentStatus;
  paymentConfirmedAt: string | null;
  paymentConfirmedByUserId: string | null;
  notes: string;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  studentMatricule: string;
  studentNom: string;
  studentPrenom: string;
  studentPromotion: string;
  studentContact: string;
  serviceCode: string;
  serviceName: string;
  agentName: string;
  agentUsername: string;
  cancelledByName?: string | null;
  paymentConfirmedByName?: string | null;
}

export type DatePeriodFilter = 'today' | 'week' | 'month' | 'custom' | 'all';

export interface TransactionFilters {
  period?: DatePeriodFilter;
  startDate?: string;
  endDate?: string;
  serviceId?: string;
  agentId?: string;
  status?: string;
  search?: string;
}

export interface SalesSummary {
  confirmedRevenue: number;
  pendingAmount: number;
  cancelledAmount: number;
  totalTransactions: number;
  completedCount: number;
  pendingCount: number;
  cancelledCount: number;
}

export interface ServiceSalesBreakdown {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  serviceDescription: string;
  currentPrice: number;
  isActive: boolean;
  totalSalesCount: number;
  completedCount: number;
  pendingCount: number;
  cancelledCount: number;
  confirmedRevenue: number;
  pendingAmount: number;
}

export interface AgentSalesBreakdown {
  agentId: string;
  agentName: string;
  agentUsername: string;
  agentRole: UserRole;
  totalTransactions: number;
  completedCount: number;
  pendingCount: number;
  cancelledCount: number;
  confirmedRevenue: number;
  pendingAmount: number;
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string;
  actorUsername: string;
  actorRole: UserRole;
}
