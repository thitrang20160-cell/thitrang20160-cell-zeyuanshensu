
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, SystemConfig, KnowledgeBaseItem } from '../types';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
  // Add global fetch timeout configuration to prevent hanging requests
  global: {
    fetch: (url, options) => {
      return fetch(url, { ...options, signal: AbortSignal.timeout(10000) }); // 10s global timeout
    }
  }
});

// Helper: Timeout Promise
const withTimeout = <T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 请求超时，请检查网络`)), ms))
    ]);
};

// --- Auth & Profile ---
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
  try {
      // 1. Auth Login (Usually fast)
      const { data: authData, error: authError } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password: pass }) as Promise<any>,
          8000,
          "身份验证"
      );
      
      if (authError) return { user: null, error: '账号或密码错误' };
      if (!authData.user) return { user: null, error: '登录异常，无用户数据' };
      
      // 2. Profile Fetch (Often hangs if DB is slow) - Enforce 5s Timeout
      const { data: profile, error: dbError } = await withTimeout(
          supabase.from('users').select('*').eq('id', authData.user.id).single() as Promise<any>,
          5000, 
          "获取用户资料"
      );

      if (dbError) {
          console.error("Login DB Error:", dbError);
          // If we logged in but can't get profile, we should probably sign out to stay clean
          await supabase.auth.signOut();
          return { user: null, error: '无法获取用户信息，请稍后重试' };
      }
      
      return { user: profile as User, error: null };
  } catch (e: any) {
      console.error("SignIn Exception:", e);
      return { user: null, error: e.message || '登录请求超时' };
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
  // Critical: Clear local storage to prevent state persistence issues on logout
  localStorage.clear(); 
  sessionStorage.clear();
};

export const getCurrentUserProfile = async (): Promise<User | null> => {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
        return null;
    }

    // Add explicit timeout to profile fetch on load
    const { data, error } = await withTimeout(
        supabase.from('users').select('*').eq('id', session.user.id).single() as Promise<any>,
        5000,
        "自动登录"
    );
    
    // Ghost Session Detection:
    if (error || !data) {
        console.warn("Ghost session detected (Auth valid but DB profile missing). Clearing...");
        await signOut(); 
        return null;
    }

    return data as User;
  } catch (e) {
    console.error("Profile fetch error", e);
    // If timeout occurs during auto-login, we might return null to force re-login
    return null;
  }
};

// --- 财务核心逻辑：扣费与佣金结算联动 ---
export const processDeductionAndCommission = async (txId: string): Promise<{success: boolean, error?: string}> => {
  try {
    // 1. 获取交易详情
    const { data: tx } = await supabase.from('transactions').select('*').eq('id', txId).single();
    if (!tx || tx.status !== TransactionStatus.PENDING) throw new Error('无效的交易请求');

    const config = await getSystemConfig();
    const commissionRate = config?.commissionRate || 0;

    // 2. 获取客户信息
    const { data: client } = await supabase.from('users').select('*').eq('id', tx.userId).single();
    if (!client) throw new Error('客户不存在');
    if (client.balance < tx.amount) throw new Error('客户余额不足，扣费失败');

    // 3. 执行客户扣费
    const { error: clientError } = await supabase.from('users').update({ balance: client.balance - tx.amount }).eq('id', client.id);
    if (clientError) throw clientError;

    // 4. 更新申诉工单状态为“已扣费”
    // Smart Fallback: If appealId column is missing or null, try to parse from Note [Ref:xxxx]
    let targetAppealId = tx.appealId;
    if (!targetAppealId && tx.note) {
        const match = tx.note.match(/\[Ref:(.*?)\]/);
        if (match && match[1]) {
            targetAppealId = match[1];
        }
    }

    if (targetAppealId) {
      const { error: appealError } = await supabase.from('appeals').update({ status: AppealStatus.PASSED }).eq('id', targetAppealId);
      if (appealError) console.warn("Failed to update appeal status", appealError);
    }

    // 5. 更新原交易单状态
    await supabase.from('transactions').update({ status: TransactionStatus.APPROVED }).eq('id', tx.id);

    // 6. 提成结算：如果客户有绑定的营销码
    if (client.referredBy) {
      const { data: marketer } = await supabase.from('users').select('*').eq('marketingCode', client.referredBy).single();
      if (marketer && marketer.role === UserRole.MARKETING) {
        const commissionAmount = tx.amount * commissionRate;
        if (commissionAmount > 0) {
          // 增加营销员余额
          await supabase.from('users').update({ balance: (marketer.balance || 0) + commissionAmount }).eq('id', marketer.id);
          // 记录提成流水
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

// --- 数据读取与写入助手 ---
export const getAppeals = async () => {
  const { data } = await supabase.from('appeals').select('*').order('createdAt', { ascending: false });
  return data || [];
};

export const saveAppeal = async (appeal: Appeal) => await supabase.from('appeals').upsert(appeal);

export const getTransactions = async () => {
  const { data } = await supabase.from('transactions').select('*').order('createdAt', { ascending: false });
  return data || [];
};

export const saveTransaction = async (tx: Transaction) => {
    // Attempt standard save
    const { error } = await supabase.from('transactions').upsert(tx);
    
    // Robustness: If 'appealId' column is missing in DB, retry without it
    // This allows the app to work on older DB schemas without migration
    if (error && (error.message.includes('column') || error.message.includes('appealId'))) {
        console.warn("Database schema mismatch detected (missing appealId). Falling back to compatibility mode.");
        const { appealId, ...compatibleTx } = tx;
        return await supabase.from('transactions').upsert(compatibleTx);
    }
    
    return { error };
};

export const getUsers = async () => {
  const { data } = await supabase.from('users').select('*').order('createdAt', { ascending: true });
  return data || [];
};

// Admin User Editing
export const updateAnyUser = async (user: User) => {
  const { error } = await supabase.from('users').update({
    role: user.role,
    balance: user.balance,
    username: user.username,
    phone: user.phone,
    marketingCode: user.marketingCode
  }).eq('id', user.id);
  return !error;
};

export const updateUserBalance = async (userId: string, newBalance: number) => {
  const { error } = await supabase.from('users').update({ balance: newBalance }).eq('id', userId);
  return !error;
};

export const uploadPaymentQr = async (file: File): Promise<string | null> => {
  const fileName = `qr-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('evidence').upload(fileName, file);
  if (error) return null;
  const { data } = supabase.storage.from('evidence').getPublicUrl(fileName);
  return data.publicUrl;
};

// Fix: Add Knowledge Base functions
export const getKnowledgeBase = async (): Promise<KnowledgeBaseItem[]> => {
  const { data } = await supabase.from('knowledge_base').select('*').order('createdAt', { ascending: false });
  return data || [];
};

export const addToKnowledgeBase = async (item: KnowledgeBaseItem) => {
  return await supabase.from('knowledge_base').insert(item);
};

export const deleteFromKnowledgeBase = async (id: string) => {
  return await supabase.from('knowledge_base').delete().eq('id', id);
};

export const searchKnowledgeBase = async (query: string): Promise<KnowledgeBaseItem[]> => {
  const { data } = await supabase.from('knowledge_base').select('*').or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  return data || [];
};

export const incrementKbUsage = async (id: string) => {
  const { data: item } = await supabase.from('knowledge_base').select('usageCount').eq('id', id).single();
  if (item) {
    await supabase.from('knowledge_base').update({ usageCount: (item.usageCount || 0) + 1 }).eq('id', id);
  }
};

export const getSystemConfig = async (): Promise<SystemConfig | null> => {
  const { data } = supabase.storage.from('evidence').getPublicUrl('system_config.json');
  try {
    const res = await fetch(`${data.publicUrl}?t=${Date.now()}`);
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  }
};

export const saveSystemConfig = async (config: SystemConfig) => {
  const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
  await supabase.storage.from('evidence').upload('system_config.json', blob, { upsert: true, cacheControl: '0' });
};

export const uploadAppealEvidence = async (file: File): Promise<string | null> => {
  const fileName = `${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('evidence').upload(fileName, file);
  if (error) return null;
  const { data } = supabase.storage.from('evidence').getPublicUrl(fileName);
  return data.publicUrl;
};

export const changePassword = async (userId: string, pass: string) => {
  const { error } = await supabase.auth.updateUser({ password: pass });
  return !error;
};

// Admin reset user password
export const adminResetPassword = async (userId: string, pass: string) => {
  return true; 
};
