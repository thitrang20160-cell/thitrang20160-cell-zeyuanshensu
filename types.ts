export type ViolationType = 'IP' | 'Counterfeit' | 'Performance' | 'Related' | 'Other';
export type SupplyChainType = 'Private Label' | 'Authorized Distributor' | 'Wholesale' | 'Dropshipping';
export type CaseStatus = 'pending' | 'reviewed' | 'submitted' | 'rejected' | 'success' | 'fail';

export type UserRole = 'super_admin' | 'admin' | 'client';

export type AIProvider = 'gemini' | 'deepseek';

export interface User {
  id: string;
  username: string;
  password?: string; // In a real app, never store plain text passwords!
  role: UserRole;
  companyName?: string; // For clients
}

export interface CaseData {
  id: string;
  userId: string; // New: Links case to a specific user
  createdAt: string;
  clientName?: string;
  clientId?: string;
  
  // New Fields for Formal POA
  companyName: string; // Legal Entity Name for Signature
  caseId: string;      // Walmart Case ID / Reference ID
  
  // Smart Data Filling
  affectedCount?: string; // e.g. "14 SKUs" or "5 Orders"
  supplierInfo?: string;  // e.g. "verified domestic supplier"
  
  suspensionEmail: string;
  storeName: string;
  productCategory: string;
  supplyChain: SupplyChainType;
  violationType: ViolationType;
  sellerExplanation: string;
  actionsTaken: string;
  poaContent: string;
  cnExplanation: string;
  status: CaseStatus;
  notes?: string;
  fileEvidenceSummary?: string; // Metadata about uploaded file
  
  // Submission Meta
  submissionTime?: string;
  walmartCaseNumber?: string;
  
  // V5.1 ODR Specifics
  isODRSuspension?: boolean; // If true, limits char count per section
}

export interface ReferenceCase {
  id: string;
  title: string;
  type: ViolationType;
  content: string; // The successful POA text
  tags: string[];
}

export interface Stats {
  total: number;
  success: number;
  fail: number;
  pending: number;
  submitted: number;
  successRate: number;
}

export interface RiskAnalysis {
  score: number; // 0-100
  level: 'Low' | 'Medium' | 'High';
  reasons: string[];
}

export interface GlobalSettings {
  // Provider Selection
  selectedProvider: AIProvider;
  
  // Keys
  apiKey: string; // Gemini Key
  deepseekKey: string; // DeepSeek Key
  
  // Cloud Database (Supabase)
  supabaseUrl: string;
  supabaseKey: string; // Anon Key

  // Walmart API Credentials
  walmartClientId: string;
  walmartClientSecret: string;
  enableSimulationMode: boolean; // If true, mocks the API call
  
  // Strategy
  strategyGeneral: string;
  strategyLogistics: string;
  strategyIP: string;
}