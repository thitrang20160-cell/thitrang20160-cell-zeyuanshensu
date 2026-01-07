
import { User, Appeal, Transaction, UserRole, SystemConfig, KnowledgeBaseItem, PoaType, TransactionType, TransactionStatus, AppealStatus } from '../types';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Auth ---
export const signUp = async (email: string, pass: string, inviteCode?: string): Promise<{ user: User | null, error: string | null }> => {
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password: pass });
  if (authError) return { user: null, error: authError.message };
  if (!authData.user) return { user: null, error: '注册失败' };

  const newUser: User = {
    id: authData.user.id,
    username: email.split('@')[0],
    role: UserRole.CLIENT,
    balance: 0,
    referredBy: inviteCode || undefined,
    createdAt: new Date().toISOString(),
  };

  const { error: dbError } = await supabase.from('users').insert(newUser);
  return { user: newUser, error: dbError ? dbError.message : null };
};

export const signIn = async (email: string, pass: string): Promise<{ user: User | null, error: string | null }> => {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (authError) return { user: null, error: '账号或密码错误' };
  
  const { data: profile } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
  return { user: profile as User, error: null };
};

export const signOut = async () => await supabase.auth.signOut();

export const getCurrentUserProfile = async (): Promise<User | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
  return data as User | null;
};

// --- Financial Logic ---

// 核心：处理扣费单并结算提成
export const processDeductionWithCommission = async (txId: string, adminId: string): Promise<{success: boolean, error?: string}> => {
  try {
    // 1. 获取交易记录和全局配置
    const { data: tx } = await supabase.from('transactions').select('*').eq('id', txId).single();
    if (!tx || tx.status !== TransactionStatus.PENDING) throw new Error('交易单状态异常');

    const config = await getSystemConfig();
    const commissionRate = config?.commissionRate || 0;

    // 2. 获取客户档案
    const { data: client } = await supabase.from('users').select('*').eq('id', tx.userId).single();
    if (!client) throw new Error('客户不存在');
    if (client.balance < tx.amount) throw new Error('客户余额不足');

    // 3. 执行扣费
    const newClientBalance = client.balance - tx.amount;
    await supabase.from('users').update({ balance: newClientBalance }).eq('id', client.id);

    // 4. 更新交易单状态
    await supabase.from('transactions').update({ status: TransactionStatus.APPROVED }).eq('id', tx.id);

    // 5. 更新工单状态为“已扣费”
    if (tx.appealId) {
      await supabase.from('appeals').update({ status: AppealStatus.PASSED }).eq('id', tx.appealId);
    }

    // 6. 提成结算逻辑：如果客户有邀请码
    if (client.referredBy) {
      const { data: marketer } = await supabase.from('users').select('*').eq('marketingCode', client.referredBy).single();
      if (marketer && marketer.role === UserRole.MARKETING) {
        const commissionAmount = tx.amount * commissionRate;
        if (commissionAmount > 0) {
          // 给营销增加余额
          await supabase.from('users').update({ balance: (marketer.balance || 0) + commissionAmount }).eq('id', marketer.id);
          // 记录提成交易
          await supabase.from('transactions').insert({
            id: `comm-${Date.now()}`,
            userId: marketer.id,
            username: marketer.username,
            type: TransactionType.COMMISSION,
            amount: commissionAmount,
            status: TransactionStatus.APPROVED,
            note: `来自客户 ${client.username} 的工单提成`,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

// --- Standard Data Helpers ---
export const getAppeals = async () => {
  const { data } = await supabase.from('appeals').select('*').order('createdAt', { ascending: false });
  return data || [];
};

export const saveAppeal = async (appeal: Appeal) => await supabase.from('appeals').upsert(appeal);

export const getTransactions = async () => {
  const { data } = await supabase.from('transactions').select('*').order('createdAt', { ascending: false });
  return data || [];
};

export const saveTransaction = async (tx: Transaction) => await supabase.from('transactions').upsert(tx);

export const getSystemConfig = async (): Promise<SystemConfig | null> => {
  const { data } = supabase.storage.from('evidence').getPublicUrl('system_config.json');
  const res = await fetch(`${data.publicUrl}?t=${Date.now()}`);
  return res.ok ? await res.json() : null;
};

export const saveSystemConfig = async (config: SystemConfig) => {
  const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
  await supabase.storage.from('evidence').upload('system_config.json', blob, { upsert: true, cacheControl: '0' });
};

export const getUsers = async () => {
  const { data } = await supabase.from('users').select('*').order('createdAt', { ascending: true });
  return data || [];
};

export const updateAnyUser = async (user: User) => {
  const { error } = await supabase.from('users').update(user).eq('id', user.id);
  return !error;
};

export const uploadAppealEvidence = async (file: File): Promise<string | null> => {
  const fileName = `${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('evidence').upload(fileName, file);
  if (error) return null;
  const { data } = supabase.storage.from('evidence').getPublicUrl(fileName);
  return data.publicUrl;
};

// --- Added missing functions for the dashboards ---

/**
 * Fix: Export missing changePassword helper
 */
export const changePassword = async (userId: string, pass: string) => {
  const { error } = await supabase.auth.updateUser({ password: pass });
  return !error;
};

/**
 * Fix: Export missing updateUserBalance helper
 */
export const updateUserBalance = async (userId: string, balance: number) => {
  const { error } = await supabase.from('users').update({ balance }).eq('id', userId);
  return !error;
};

/**
 * Fix: Export missing uploadPaymentQr helper
 */
export const uploadPaymentQr = async (file: File): Promise<string | null> => {
  const fileName = `qr-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('evidence').upload(fileName, file);
  if (error) return null;
  const { data } = supabase.storage.from('evidence').getPublicUrl(fileName);
  return data.publicUrl;
};

/**
 * Fix: Export missing getKnowledgeBase helper
 */
export const getKnowledgeBase = async (): Promise<KnowledgeBaseItem[]> => {
  const { data } = await supabase.from('knowledge_base').select('*').order('usageCount', { ascending: false });
  return data || [];
};

/**
 * Fix: Export missing addToKnowledgeBase helper
 */
export const addToKnowledgeBase = async (item: KnowledgeBaseItem) => {
  return await supabase.from('knowledge_base').insert(item);
};

/**
 * Fix: Export missing deleteFromKnowledgeBase helper
 */
export const deleteFromKnowledgeBase = async (id: string) => {
  return await supabase.from('knowledge_base').delete().eq('id', id);
};

/**
 * Fix: Export missing searchKnowledgeBase helper
 */
export const searchKnowledgeBase = async (query: string): Promise<KnowledgeBaseItem[]> => {
  const { data } = await supabase.from('knowledge_base').select('*').ilike('title', `%${query}%`);
  return data || [];
};

/**
 * Fix: Export missing incrementKbUsage helper
 */
export const incrementKbUsage = async (id: string) => {
  const { data: currentData } = await supabase.from('knowledge_base').select('usageCount').eq('id', id).single();
  if (currentData) {
    await supabase.from('knowledge_base').update({ usageCount: (currentData.usageCount || 0) + 1 }).eq('id', id);
  }
};
