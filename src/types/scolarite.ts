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
  details: Record<string, string>;
  paymentId: string | null;
  paymentRecordStatus: 'PAYE' | 'ANNULE' | null;
  paymentMethod: 'CASH' | null;
  paymentAmount: number | null;
  productionId: string | null;
  productionStatus: 'A_PRODUIRE' | 'EN_PRODUCTION' | 'PRET' | 'REMIS' | null;
  documentReference: string | null;
}

export type DatePeriodFilter = 'today' | 'week' | 'month' | 'custom' | 'all';

export interface TransactionFilters {
  period?: DatePeriodFilter;
  startDate?: string;
  endDate?: string;
  serviceId?: string;
  agentId?: string;
  status?: string;
  productionStatus?: string;
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

/* -------------------------------------------------------------------------- */
/* Payments, production and documents                                         */
/* -------------------------------------------------------------------------- */

export type PaymentRecordStatus = 'PAYE' | 'ANNULE';

export interface Payment {
  id: string;
  transactionId: string;
  amount: number;
  method: 'CASH';
  status: PaymentRecordStatus;
  receivedByUserId: string;
  receivedByName: string;
  paidAt: string;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
}

export type ProductionStatus = 'A_PRODUIRE' | 'EN_PRODUCTION' | 'PRET' | 'REMIS';

export interface ProductionRequest {
  id: string;
  transactionId: string;
  documentType: string;
  status: ProductionStatus;
  requestedByUserId: string;
  generatedDocumentReference: string | null;
  documentVersion: number;
  startedAt: string | null;
  completedAt: string | null;
  deliveredAt: string | null;
  deliveredTo: string | null;
  createdAt: string;
  updatedAt: string;
  transactionReference: string;
  transactionStatus: TransactionStatus;
  paymentStatus: PaymentStatus;
  priceAtTransaction: number;
  performedByUserId: string;
  details: Record<string, string>;
  studentMatricule: string;
  studentNom: string;
  studentPrenom: string;
  studentPromotion: string;
  serviceName: string;
  serviceCode: string;
  requestedByName: string;
  startedByName: string | null;
  verifiedByName: string | null;
  deliveredByName: string | null;
}

export interface GeneratedDocument {
  templateVersion: number;
  documentReference: string;
  version: number;
  documentType: string;
  title: string;
  institutionName: string;
  generatedAt: string;
  transactionReference: string;
  student: { matricule: string; nom: string; prenom: string; promotion: string };
  details: Record<string, string>;
  grades: Array<{ semester: string; courseCode: string; courseName: string; credits: number; grade: number; status: string }>;
}

export interface ProductionSummary {
  toProduce: number;
  inProduction: number;
  ready: number;
  delivered: number;
}

export interface ProductionFilters extends TransactionFilters {
  productionStatus?: ProductionStatus;
}
