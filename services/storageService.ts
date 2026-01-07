
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
  global: {
    fetch: (url, options) => {
      return fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); // 延长超时适应大数据
    }
  }
});

const withTimeout = <T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 请求超时，请检查网络`)), ms))
    ]);
};

// --- Auth & Profile (不变) ---
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
      const { data: authData, error: authError } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password: pass }) as Promise<any>,
          8000,
          "身份验证"
      );
      
      if (authError) return { user: null, error: '账号或密码错误' };
      if (!authData.user) return { user: null, error: '登录异常，无用户数据' };
      
      const { data: profile, error: dbError } = await withTimeout(
          supabase.from('users').select('*').eq('id', authData.user.id).single() as Promise<any>,
          5000, 
          "获取用户资料"
      );

      if (dbError) {
          await supabase.auth.signOut();
          return { user: null, error: '无法获取用户信息' };
      }
      return { user: profile as User, error: null };
  } catch (e: any) {
      return { user: null, error: e.message || '登录请求超时' };
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
  localStorage.clear(); 
  sessionStorage.clear();
};

export const getCurrentUserProfile = async (): Promise<User | null> => {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) return null;
    const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
    return data as User;
  } catch (e) { return null; }
};

// --- 核心财务逻辑：双轨制分润 (原子化增强版) ---
export const processDeductionAndCommission = async (txId: string): Promise<{success: boolean, error?: string}> => {
  try {
    const { data: tx, error: txError } = await supabase.from('transactions').select('*').eq('id', txId).single();
    if (txError || !tx) throw new Error('交易单不存在');
    if (tx.status !== TransactionStatus.PENDING) throw new Error(`交易状态异常 (${tx.status})`);

    const config = await getSystemConfig();
    const marketingRate = config?.commissionRate || 0.1; 
    const staffRate = config?.staffBonusRate || 0.1;     

    const { data: client } = await supabase.from('users').select('*').eq('id', tx.userId).single();
    if (!client) throw new Error('客户不存在');
    if (client.balance < tx.amount) throw new Error('客户余额不足');

    // [关键] 乐观锁扣费
    const { error: clientError, data: updatedClient } = await supabase
        .from('users')
        .update({ balance: client.balance - tx.amount })
        .eq('id', client.id)
        .eq('balance', client.balance) 
        .select();

    if (clientError || !updatedClient || updatedClient.length === 0) {
        throw new Error('资金结算冲突，请重试');
    }

    await supabase.from('transactions').update({ status: TransactionStatus.APPROVED }).eq('id', tx.id);

    // 更新工单
    let targetAppealId = tx.appealId;
    if (!targetAppealId && tx.note) {
        const match = tx.note.match(/Ref:([a-zA-Z0-9-]+)/);
        if (match && match[1]) targetAppealId = match[1];
    }

    let appealData: Appeal | null = null;
    if (targetAppealId) {
      const { data } = await supabase.from('appeals').select('*').eq('id', targetAppealId).single();
      if (data) {
         appealData = data as Appeal;
         await supabase.from('appeals').update({ 
             status: AppealStatus.PASSED,
             updatedAt: new Date().toISOString()
         }).eq('id', targetAppealId);
      }
    }

    // 营销提成
    if (client.referredBy) {
      const { data: marketer } = await supabase.from('users').select('*').eq('marketingCode', client.referredBy).single();
      if (marketer && (marketer.role === UserRole.MARKETING || marketer.role === UserRole.SUPER_ADMIN)) {
        const commissionAmount = Number((tx.amount * marketingRate).toFixed(2));
        if (commissionAmount > 0) {
          // 使用 RPC increment 可能会更好，但这里简化为直接更新 (生产环境建议用 RPC)
          const { data: mNew } = await supabase.from('users').select('balance').eq('id', marketer.id).single();
          if (mNew) {
             await supabase.from('users').update({ balance: mNew.balance + commissionAmount }).eq('id', marketer.id);
             await supabase.from('transactions').insert({
                id: `comm-mkt-${Date.now()}-${Math.floor(Math.random()*10000)}`,
                userId: marketer.id,
                username: marketer.username,
                type: TransactionType.COMMISSION,
                amount: commissionAmount,
                status: TransactionStatus.APPROVED,
                note: `[营销] 客户 ${client.username} 消费`,
                createdAt: new Date().toISOString()
             });
          }
        }
      }
    }

    // 员工绩效
    if (appealData && appealData.handlerId) {
       const { data: staff } = await supabase.from('users').select('*').eq('id', appealData.handlerId).single();
       if (staff && staff.role === UserRole.ADMIN) {
           const bonusAmount = Number((tx.amount * staffRate).toFixed(2));
           if (bonusAmount > 0) {
               const { data: sNew } = await supabase.from('users').select('balance').eq('id', staff.id).single();
               if (sNew) {
                   await supabase.from('users').update({ balance: sNew.balance + bonusAmount }).eq('id', staff.id);
                   await supabase.from('transactions').insert({
                        id: `comm-staff-${Date.now()}-${Math.floor(Math.random()*10000)}`,
                        userId: staff.id,
                        username: staff.username,
                        type: TransactionType.STAFF_BONUS,
                        amount: bonusAmount,
                        status: TransactionStatus.APPROVED,
                        appealId: appealData.id,
                        note: `[绩效] 工单 ${appealData.id.slice(-4)}`,
                        createdAt: new Date().toISOString()
                   });
               }
           }
       }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Financial Process Error:", err);
    return { success: false, error: err.message };
  }
};

// --- 大数据适配: 分页与搜索 ---

// 获取申诉：支持分页和搜索
export const getAppeals = async (page: number = 0, limit: number = 20, searchTerm: string = '') => {
  const from = page * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('appeals')
    .select('*', { count: 'exact' })
    .order('createdAt', { ascending: false })
    .range(from, to);

  if (searchTerm) {
    // 支持搜邮箱或用户名
    query = query.or(`emailAccount.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`);
  }

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
};

// 获取交易：支持分页
export const getTransactions = async (page: number = 0, limit: number = 20, statusFilter?: TransactionStatus) => {
  const from = page * limit;
  const to = from + limit - 1;
  
  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .order('createdAt', { ascending: false })
    .range(from, to);
    
  if (statusFilter) {
      query = query.eq('status', statusFilter);
  }

  const { data, count } = await query;
  return { data: data || [], count: count || 0 };
};

// 用户管理：支持搜索
export const searchUsers = async (term: string) => {
    const { data } = await supabase
        .from('users')
        .select('*')
        .ilike('username', `%${term}%`)
        .limit(20);
    return data || [];
};

// 基础CRUD保持不变
export const saveAppeal = async (appeal: Appeal) => await supabase.from('appeals').upsert(appeal);
export const saveTransaction = async (tx: Transaction) => { const { error } = await supabase.from('transactions').upsert(tx); return { error }; };
export const getUsers = async () => { const { data } = await supabase.from('users').select('*').limit(50); return data || []; }; // 默认只取少量，依赖搜索
export const updateAnyUser = async (user: User) => { const { error } = await supabase.from('users').update({ role: user.role, balance: user.balance, username: user.username, phone: user.phone, marketingCode: user.marketingCode }).eq('id', user.id); return !error; };
export const uploadPaymentQr = async (file: File) => { const fileName = `qr-${Date.now()}`; const { error } = await supabase.storage.from('evidence').upload(fileName, file); if(error) return null; const { data } = supabase.storage.from('evidence').getPublicUrl(fileName); return data.publicUrl; };
export const getKnowledgeBase = async () => { const { data } = await supabase.from('knowledge_base').select('*').order('createdAt', { ascending: false }); return data || []; };
export const addToKnowledgeBase = async (item: KnowledgeBaseItem) => await supabase.from('knowledge_base').insert(item);
export const deleteFromKnowledgeBase = async (id: string) => await supabase.from('knowledge_base').delete().eq('id', id);
export const getSystemConfig = async (): Promise<SystemConfig | null> => { const { data } = supabase.storage.from('evidence').getPublicUrl('system_config.json'); try { const res = await fetch(`${data.publicUrl}?t=${Date.now()}`); return res.ok ? await res.json() : null; } catch (e) { return null; } };
export const saveSystemConfig = async (config: SystemConfig) => { const blob = new Blob([JSON.stringify(config)], { type: 'application/json' }); await supabase.storage.from('evidence').upload('system_config.json', blob, { upsert: true, cacheControl: '0' }); };
export const uploadAppealEvidence = async (file: File) => { const fileName = `${Date.now()}-${file.name}`; const { error } = await supabase.storage.from('evidence').upload(fileName, file); if(error) return null; const { data } = supabase.storage.from('evidence').getPublicUrl(fileName); return data.publicUrl; };
export const changePassword = async (userId: string, pass: string) => { const { error } = await supabase.auth.updateUser({ password: pass }); return !error; };
