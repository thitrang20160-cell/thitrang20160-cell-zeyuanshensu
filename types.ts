
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // 老板
  ADMIN = 'ADMIN',             // 员工/技术
  FINANCE = 'FINANCE',         // 财务
  MARKETING = 'MARKETING',     // 营销
  CLIENT = 'CLIENT',           // 客户
}

export enum AppealStatus {
  PENDING = '待处理',
  PROCESSING = '处理中',
  FOLLOW_UP = '跟进中',
  PASSED_PENDING_DEDUCTION = '申诉通过-待扣费', // 员工操作后的状态
  PASSED = '申诉通过-已扣费', // 财务/老板审批后的最终状态
  REJECTED = '申诉驳回',
}

export enum TransactionType {
  RECHARGE = '充值',
  DEDUCTION = '扣费',
  COMMISSION = '提成收入', // 营销员的收入
}

export enum TransactionStatus {
  PENDING = '待审核',
  APPROVED = '已入账',
  REJECTED = '已拒绝',
}

export interface User {
  id: string;
  username: string;
  phone?: string;
  role: UserRole;
  balance: number;
  marketingCode?: string; // 营销员的专属邀请码
  referredBy?: string;    // 客户关联的营销码
  createdAt: string;
}

export interface Appeal {
  id: string;
  userId: string;
  username: string;
  accountType: string;
  loginInfo: string;
  emailAccount: string;
  emailPass: string;
  description?: string;
  screenshot?: string;
  status: AppealStatus;
  statusDetail?: string;
  adminNotes: string;
  deductionAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  username: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  appealId?: string; // 关联的申诉案件
  note?: string;
  createdAt: string;
}

export interface SystemConfig {
  contactInfo: string;
  paymentQrUrl?: string;
  commissionRate: number; // 提成比例 (如 0.2 代表 20%)
  marketingBaseCases?: number;
  marketingSuccessRate?: string;
  marketingBaseProcessing?: number;
}

export enum PoaType {
  ACCOUNT_SUSPENSION = '店铺账户暂停 (Account Suspension)',
  FULFILLMENT_SUSPENSION = '自发货权限暂停 (Fulfillment Suspension)',
  OTHER = '其他问题'
}

export const POA_TYPE_MAPPING: Record<PoaType, string[]> = {
  [PoaType.ACCOUNT_SUSPENSION]: [
    'OTD (发货及时率低) - 导致封店',
    'VTR (物流追踪率低) - 导致封店',
    '取消率过高 - 导致封店',
    '退款率过高 - 导致封店',
    '知识产权 - 商标侵权 (Trademark)',
    '知识产权 - 版权侵权 (Copyright)',
    '知识产权 - 专利侵权 (Patent)',
    '知识产权 - 假冒商品 (Counterfeit)',
    '操控评论 (Review Manipulation)',
    '客户欺诈投诉 (Customer Fraud Complaint)',
    '二审/身份验证 (Identity Verification)',
    '违反销售政策 (Prohibited Items)',
    '关联账户 (Related Accounts)',
    '其他 - 导致封店'
  ],
  [PoaType.FULFILLMENT_SUSPENSION]: [
    'OTD (发货及时率低) - 暂停自发货',
    'VTR (物流追踪率低) - 暂停自发货',
    '取消率过高 - 暂停自发货'
  ],
  [PoaType.OTHER]: [
    '退货地址验证',
    '资金冻结申诉',
    '其他非账号问题'
  ]
};

export interface KnowledgeBaseItem {
  id: string;
  type: PoaType;
  subType: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt: string;
  usageCount: number;
}
