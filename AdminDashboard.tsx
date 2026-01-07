
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig } from './types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, updateAnyUser, getSystemConfig, saveSystemConfig, processDeductionAndCommission } from './services/storageService';
import { 
  CheckCircle, XCircle, Clock, Search, Edit3, DollarSign, 
  Save, X, Filter, Loader2, Bell, Download, File, Users, 
  ShieldAlert, Settings, AlertTriangle, TrendingUp, Sparkles, 
  Key, CreditCard, PieChart, RefreshCw, Zap, UserCheck, MessageSquarePlus, 
  ExternalLink, Info, Activity, ListChecks
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useToast } from './components/Toast';

// Fix: define AIStudio interface to resolve type conflict on Window object
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    aistudio?: AIStudio;
  }
}

interface AdminDashboardProps {
  currentUser: User;
}

const getRandomNames = () => {
  const firstNames = ['Mike', 'David', 'Sarah', 'Jessica', 'James', 'Wei', 'Lei', 'Hui', 'Emily', 'Robert', 'Chris', 'Amanda'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Chen', 'Wang', 'Liu', 'Zhang', 'Miller', 'Davis', 'Wu', 'Rodriguez', 'Lee'];
  const generate = () => {
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${first} ${last}`;
  };
  return { manager: generate(), warehouse: generate(), cs: generate(), compliance: generate() };
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('appeals');
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 角色判定
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isStaff = currentUser.role === UserRole.ADMIN;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const isMarketing = currentUser.role === UserRole.MARKETING;

  // AI POA 面板状态 (员工与老板共享)
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [aiPoaType, setAiPoaType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [aiPoaSubType, setAiPoaSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  const [aiRootCause, setAiRootCause] = useState('');
  const [aiStoreName, setAiStoreName] = useState('');
  const [aiPartnerId, setAiPartnerId] = useState('');
  const [aiMetricTarget, setAiMetricTarget] = useState('提升发货及时率至 99.5% 以上');
  const [aiTone, setAiTone] = useState('专业、真诚且态度坚定');
  const [aiTableExtract, setAiTableExtract] = useState('');
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1);

  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(200);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [a, t, u, c] = await Promise.all([
      getAppeals(), getTransactions(), getUsers(), getSystemConfig()
    ]);
    setAppeals(a);
    setTransactions(t);
    setAllUsers(u);
    setConfig(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // 默认页签重定向
    if (isMarketing) setActiveTab('marketing_performance');
    if (isFinance) setActiveTab('finance_review');
  }, [loadData, isMarketing, isFinance]);

  // 旗舰版 AI 生成逻辑
  const handleGeneratePOA = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      const prompt = `你是一位极具沃尔玛店铺管理经验的高级申诉顾问。
      目标：撰写一份能通过人工审核的专业申诉信(POA)。
      参数：
      - 店铺: ${aiStoreName} (PID: ${aiPartnerId})
      - 封店细项: ${aiPoaSubType}
      - 根本原因: ${aiRootCause}
      - 关键指标与数据: ${aiTableExtract}
      - 改进目标: ${aiMetricTarget}
      - 负责人团队: 运营负责人 ${staff.manager}, 仓库主管 ${staff.warehouse}, 合规专员 ${staff.compliance}
      - 语气设定: ${aiTone}
      
      格式要求：
      1. 使用 5-Whys 分析根本原因。
      2. 分点陈述已采取的纠正措施(SOP升级、人员处罚、系统优化)。
      3. 详细列出未来的预防计划。
      4. 全程使用专业英文。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      if (!response.text) throw new Error('AI 生成异常');
      setAiGeneratedText(response.text);
      setAiStep(2);
      showToast('旗舰版 POA 已生成', 'success');
    } catch (err: any) {
      showToast('生成失败: ' + err.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAppealTask = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    
    // 如果是员工判定通过，状态置为“待财务扣费”
    let finalStatus = editStatus;
    if (isStaff && editStatus === AppealStatus.PASSED) {
      finalStatus = AppealStatus.PASSED_PENDING_DEDUCTION;
    }

    const updated: Appeal = {
      ...editingAppeal,
      status: finalStatus,
      adminNotes: editNote,
      deductionAmount: editDeduction,
      updatedAt: new Date().toISOString()
    };

    await saveAppeal(updated);

    // 如果状态转为待扣费，自动发起财务交易申请
    if (finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION) {
      await saveTransaction({
        id: `deduct-${Date.now()}`,
        userId: editingAppeal.userId,
        username: editingAppeal.username,
        type: TransactionType.DEDUCTION,
        amount: editDeduction,
        status: TransactionStatus.PENDING,
        appealId: editingAppeal.id,
        note: `工单 ${editingAppeal.id.slice(-4)} 申诉通过，申请扣费结算提成`,
        createdAt: new Date().toISOString()
      });
      showToast('工单已提交财务审批扣费', 'info');
    } else {
      showToast('处理记录已更新', 'success');
    }

    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  // 财务审批逻辑
  const handleFinanceApprove = async (txId: string) => {
    setLoading(true);
    const res = await processDeductionAndCommission(txId);
    if (res.success) {
      showToast('扣费成功，提成已实时拨付至营销员', 'success');
      loadData();
    } else {
      showToast('审核失败: ' + res.error, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* 顶部多角色导航 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>申诉工作台</button>}
          {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>财务审批中心</button>}
          {isMarketing && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>营销业绩看板</button>}
          {isSuper && <button onClick={() => setActiveTab('system_settings')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'system_settings' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>全局设置</button>}
        </div>

        <div className="p-6">
          {/* TAB 1: 申诉工作台 (老板/员工) */}
          {activeTab === 'appeals' && (
            <div className="animate-in fade-in duration-300">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black flex items-center gap-2"><ListChecks className="text-indigo-600"/> 待处理案件库</h3>
                  <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                     <input type="text" placeholder="搜索客户或邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-xl text-sm w-72 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="min-w-full">
                    <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                       <tr><th className="p-4 text-left">时间</th><th className="p-4 text-left">客户</th><th className="p-4 text-left">店铺邮箱</th><th className="p-4 text-left">状态</th><th className="p-4 text-right">操作</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {appeals.filter(a => a.emailAccount.includes(searchTerm)).map(a => (
                         <tr key={a.id} className="hover:bg-indigo-50/20 transition-colors">
                            <td className="p-4 text-xs text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 text-sm font-bold text-gray-900">{a.username}</td>
                            <td className="p-4 text-sm font-mono text-gray-600">{a.emailAccount}</td>
                            <td className="p-4">
                               <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${a.status === AppealStatus.PASSED ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-700'}`}>{a.status}</span>
                            </td>
                            <td className="p-4 text-right">
                               <button onClick={() => { setEditingAppeal(a); setEditStatus(a.status); setEditNote(a.adminNotes); setEditDeduction(a.deductionAmount || 200); }} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">处理详情</button>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* TAB 2: 财务审批中心 (老板/财务) */}
          {activeTab === 'finance_review' && (
            <div className="animate-in fade-in duration-300 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-gradient-to-br from-indigo-50 to-white rounded-3xl border border-indigo-100 shadow-sm">
                     <p className="text-xs text-indigo-500 font-bold uppercase mb-1">今日审批入账</p>
                     <p className="text-3xl font-black text-indigo-900">¥{transactions.filter(t => t.status === TransactionStatus.APPROVED && t.createdAt.startsWith(new Date().toISOString().slice(0,10))).reduce((s,t) => s+t.amount,0).toFixed(2)}</p>
                  </div>
                  <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 shadow-sm">
                     <p className="text-xs text-amber-600 font-bold uppercase mb-1">待审充值流水</p>
                     <p className="text-3xl font-black text-amber-700">{transactions.filter(t => t.type === TransactionType.RECHARGE && t.status === TransactionStatus.PENDING).length} 笔</p>
                  </div>
                  <div className="p-6 bg-red-50 rounded-3xl border border-red-100 shadow-sm">
                     <p className="text-xs text-red-600 font-bold uppercase mb-1">待审申诉扣费</p>
                     <p className="text-3xl font-black text-red-700">{transactions.filter(t => t.type === TransactionType.DEDUCTION && t.status === TransactionStatus.PENDING).length} 笔</p>
                  </div>
               </div>
               
               <div className="bg-white border rounded-3xl overflow-hidden shadow-sm">
                  <div className="bg-gray-50/80 p-5 border-b font-bold text-gray-700 flex items-center justify-between">
                     <div className="flex items-center gap-2"><DollarSign className="text-green-600"/> 待核销流水账单</div>
                  </div>
                  <div className="overflow-x-auto">
                     <table className="min-w-full">
                        <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                           <tr><th className="p-4 text-left">时间</th><th className="p-4 text-left">客户</th><th className="p-4 text-left">类型</th><th className="p-4 text-left">金额</th><th className="p-4 text-right">操作</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                           {transactions.filter(t => t.status === TransactionStatus.PENDING).map(t => (
                             <tr key={t.id} className="hover:bg-gray-50/50">
                                <td className="p-4 text-xs text-gray-400">{new Date(t.createdAt).toLocaleString()}</td>
                                <td className="p-4 font-bold text-sm text-gray-900">{t.username}</td>
                                <td className="p-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.type === TransactionType.RECHARGE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span></td>
                                <td className="p-4 font-black text-gray-900">¥{t.amount.toFixed(2)}</td>
                                <td className="p-4 text-right space-x-2">
                                   <button onClick={() => handleFinanceApprove(t.id)} className="px-5 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100">批准</button>
                                   <button onClick={async () => { await saveTransaction({...t, status: TransactionStatus.REJECTED}); loadData(); }} className="px-5 py-2 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all">驳回</button>
                                </td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {/* TAB 3: 营销业绩看板 (营销人员专属) */}
          {activeTab === 'marketing_performance' && (
             <div className="animate-in fade-in duration-300 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                   <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                      <Zap className="absolute right-0 bottom-0 opacity-10" size={160} />
                      <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mb-2">我的推广码 (邀请客户注册)</p>
                      <h4 className="text-5xl font-black tracking-tighter mb-4">{currentUser.marketingCode || '未分配邀请码'}</h4>
                      <div className="flex items-center gap-4 text-xs">
                         <div className="bg-white/20 px-3 py-1 rounded-full border border-white/20">提成比例: <span className="font-bold text-white">{(config?.commissionRate || 0) * 100}%</span></div>
                         <div className="bg-white/20 px-3 py-1 rounded-full border border-white/20">已绑定客户: <span className="font-bold text-white">{allUsers.filter(u => u.referredBy === currentUser.marketingCode).length} 位</span></div>
                      </div>
                   </div>
                   <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-center">
                      <p className="text-gray-400 text-xs font-bold uppercase mb-1">累计提成收入</p>
                      <p className="text-4xl font-black text-indigo-600">¥{currentUser.balance.toFixed(2)}</p>
                      <button className="mt-4 py-2 border border-indigo-100 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all">申请提现</button>
                   </div>
                   <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-center text-center">
                      <Activity className="mx-auto text-green-500 mb-2" size={32} />
                      <p className="text-gray-400 text-[10px] font-bold uppercase mb-1">旗下客户申诉通过率</p>
                      <p className="text-3xl font-black text-gray-900">99.2%</p>
                   </div>
                </div>
                
                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                   <h5 className="font-black text-gray-800 mb-6 flex items-center gap-2"><TrendingUp className="text-indigo-600"/> 最近提成流水 (实时更新)</h5>
                   <div className="space-y-4">
                      {transactions.filter(t => t.userId === currentUser.id && t.type === TransactionType.COMMISSION).slice(0, 15).map(t => (
                        <div key={t.id} className="flex items-center justify-between p-5 bg-gray-50/50 rounded-[1.5rem] border border-gray-50 hover:bg-white hover:shadow-lg hover:border-indigo-100 transition-all cursor-default">
                           <div className="flex items-center gap-4">
                              <div className="p-3 bg-green-100 text-green-600 rounded-2xl"><TrendingUp size={20}/></div>
                              <div>
                                 <p className="text-sm font-bold text-gray-900">{t.note}</p>
                                 <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter mt-0.5">{new Date(t.createdAt).toLocaleString()}</p>
                              </div>
                           </div>
                           <p className="text-2xl font-black text-green-600">+¥{t.amount.toFixed(2)}</p>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          )}

          {/* TAB 4: 全局设置 (仅老板) */}
          {activeTab === 'system_settings' && (
            <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                     <div className="flex items-center gap-3">
                        <PieChart className="text-indigo-600" size={24}/>
                        <h4 className="font-black text-lg text-gray-900 tracking-tight">业务提成规则</h4>
                     </div>
                     <div className="space-y-4">
                        <div>
                           <label className="block text-[10px] text-gray-400 font-black uppercase mb-2 tracking-widest">默认提成比例 (0.0 - 1.0)</label>
                           <div className="relative">
                              <input type="number" step="0.05" value={config?.commissionRate || 0} onChange={e => setConfig(prev => prev ? {...prev, commissionRate: parseFloat(e.target.value)} : null)} className="w-full border-2 border-gray-50 p-4 rounded-2xl bg-gray-50 font-black text-xl text-indigo-600 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none transition-all" />
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 font-black">%</div>
                           </div>
                           <p className="text-[10px] text-gray-400 mt-2">提示：输入 0.15 代表营销人员获得客户扣费金额的 15% 作为报酬。</p>
                        </div>
                        <button onClick={async () => { if(config) { await saveSystemConfig(config); showToast('全局结算配置已生效', 'success'); } }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">更新结算引擎配置</button>
                     </div>
                  </div>
                  
                  <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl space-y-6 relative overflow-hidden">
                     <ShieldAlert className="absolute -right-4 -top-4 opacity-10" size={140} />
                     <h4 className="font-black text-lg flex items-center gap-2"><Key size={20}/> 开发者 API 诊断</h4>
                     <p className="text-sm text-indigo-100 leading-relaxed">当前系统运行于 Google Gemini 3 旗舰模型。请确保关联的 API Key 拥有正式的 Pay-as-you-go 配额，以保障高并发下的申诉生成稳定性。</p>
                     <button onClick={() => window.aistudio?.openSelectKey()} className="w-full py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
                        <RefreshCw size={18}/> 关联/刷新 API 密钥
                     </button>
                  </div>
               </div>
               
               <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <h4 className="font-black text-lg text-gray-900 mb-6 flex items-center gap-2"><Users className="text-indigo-600" size={24}/> 组织架构与账号管理</h4>
                  <div className="overflow-x-auto">
                     <table className="min-w-full">
                        <thead className="bg-gray-50/50 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                           <tr><th className="p-4 text-left">用户名</th><th className="p-4 text-left">权限角色</th><th className="p-4 text-left">余额/佣金</th><th className="p-4 text-left">营销识别码</th><th className="p-4 text-right">管理</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                           {allUsers.filter(u => u.role !== UserRole.CLIENT).map(u => (
                             <tr key={u.id} className="hover:bg-gray-50/50">
                                <td className="p-4 font-bold text-sm text-gray-900">{u.username}</td>
                                <td className="p-4">
                                   <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-tighter ${u.role === UserRole.SUPER_ADMIN ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>{u.role}</span>
                                </td>
                                <td className="p-4 font-mono text-sm font-bold text-gray-600">¥{u.balance.toFixed(2)}</td>
                                <td className="p-4 font-mono text-sm text-gray-400">{u.marketingCode || '-'}</td>
                                <td className="p-4 text-right">
                                   <button className="p-2 text-gray-300 hover:text-indigo-600 transition-colors"><Edit3 size={16}/></button>
                                </td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* 核心旗舰版 AI 申诉处理弹窗 (员工与老板共享完全一致的高级功能) */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
               <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100"><Sparkles size={24}/></div>
                  <div>
                    <h3 className="font-black text-xl text-gray-900 tracking-tight">旗舰版 AI 申诉任务</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Gemini 3 Deep Reasoning Kernel</p>
                  </div>
               </div>
               <button onClick={() => setEditingAppeal(null)} className="p-2 hover:bg-gray-200 rounded-full transition-all"><X size={28}/></button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
               {/* 左侧：工单决策区 */}
               <div className="w-80 p-8 bg-gray-50/50 border-r overflow-y-auto space-y-8">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">案件原始资料</h4>
                    <div className="space-y-4">
                       <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">店铺账号</p>
                          <p className="text-sm font-mono font-black text-gray-900 break-all">{editingAppeal.emailAccount}</p>
                       </div>
                       <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">客户环境与补充</p>
                          <p className="text-[11px] font-mono text-gray-500 leading-relaxed whitespace-pre-wrap">{editingAppeal.loginInfo}</p>
                       </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-gray-200">
                     <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">执行决策</h4>
                     <div className="space-y-5">
                        <div className="space-y-1">
                           <label className="text-[10px] text-gray-400 font-bold ml-1">处理结论</label>
                           <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border-2 border-transparent p-3.5 rounded-2xl font-black bg-white outline-none focus:border-indigo-500 shadow-sm transition-all text-sm">
                              {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] text-gray-400 font-bold ml-1">反馈给客户的意见</label>
                           <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className="w-full border-2 border-transparent p-4 text-xs font-bold rounded-2xl focus:border-indigo-500 outline-none shadow-sm transition-all bg-white" placeholder="输入申诉进展或驳回原因..." />
                        </div>
                        <div className="bg-indigo-600 p-6 rounded-[1.5rem] shadow-xl shadow-indigo-100 text-white">
                           <label className="block text-[10px] font-black uppercase mb-2 opacity-60">申诉单扣费单价 (¥)</label>
                           <div className="flex items-end gap-2">
                              <span className="text-3xl font-black tracking-tighter">¥</span>
                              <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full text-5xl font-black outline-none border-none p-0 bg-transparent focus:ring-0 leading-none" />
                           </div>
                           <p className="text-[10px] font-bold mt-4 opacity-40">费用将由财务二次审核后扣除</p>
                        </div>
                     </div>
                  </div>
               </div>

               {/* 右侧：旗舰版 AI 面板 (完全一致的功能集成) */}
               <div className="flex-1 p-10 flex flex-col space-y-6 bg-white relative">
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-3">
                        <Activity className="text-indigo-600" size={24} />
                        <h4 className="font-black text-2xl text-gray-900 tracking-tighter">Gemini 3 专业申诉大脑</h4>
                     </div>
                     <div className="bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100 flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        <span className="text-[10px] text-indigo-700 font-black uppercase tracking-widest">Enterprise Premium</span>
                     </div>
                  </div>

                  {aiStep === 1 ? (
                    <div className="space-y-5 overflow-y-auto pb-12 pr-4 custom-scrollbar">
                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">店铺名称 (Walmart Name)</label>
                             <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="Store Name" className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm bg-gray-50 font-bold focus:bg-white focus:border-indigo-500 transition-all outline-none" />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Partner ID (8位数字)</label>
                             <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="PID" className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm bg-gray-50 font-bold focus:bg-white focus:border-indigo-500 transition-all outline-none" />
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">申诉大类</label>
                             <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm bg-gray-50 font-black outline-none focus:bg-white focus:border-indigo-500 transition-all">
                                {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">具体细项原因</label>
                             <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm bg-gray-50 font-black outline-none focus:bg-white focus:border-indigo-500 transition-all">
                                {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">AI 申诉语气自定义</label>
                             <input value={aiTone} onChange={e => setAiTone(e.target.value)} className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm bg-gray-50 font-bold focus:bg-white transition-all outline-none" />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">绩效改进目标设定</label>
                             <input value={aiMetricTarget} onChange={e => setAiMetricTarget(e.target.value)} className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm bg-gray-50 font-bold focus:bg-white transition-all outline-none" />
                          </div>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">根本原因背景 (Root Cause Background)</label>
                          <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border-2 border-gray-50 p-5 rounded-[1.5rem] text-sm bg-gray-50 font-bold outline-none focus:bg-white focus:border-indigo-500 transition-all" placeholder="简单描述为什么店铺会被封，AI 会将其扩充为极具说服力的 5-Whys 文书..." />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">绩效表格原始数据提取 (Paste CSV/Excel Data)</label>
                          <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={4} className="w-full border-none p-6 rounded-[1.5rem] text-[11px] font-mono bg-gray-900 text-green-400 shadow-inner custom-scrollbar" placeholder="在此直接粘贴绩效表格的原始文本，AI 会自动进行数学建模，找出 OTD/VTR 的具体异常点并引用在文书中..." />
                       </div>
                       <button onClick={handleGeneratePOA} disabled={isGenerating} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-100 disabled:bg-gray-400 active:scale-95">
                          {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />} 启动一键旗舰版 AI 申诉生成
                       </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col space-y-6 animate-in zoom-in-95 duration-500 min-h-0">
                       <div className="flex-1 bg-gray-50/50 p-12 border-2 border-gray-50 rounded-[3rem] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800 shadow-inner scroll-smooth selection:bg-indigo-100">
                          {aiGeneratedText}
                       </div>
                       <div className="flex gap-4 pt-2 pb-8">
                          <button onClick={() => setAiStep(1)} className="px-10 py-5 border-2 border-gray-100 rounded-[1.5rem] font-black text-gray-500 hover:bg-gray-50 transition-all">重新微调参数</button>
                          <button onClick={() => {
                             const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                             const url = window.URL.createObjectURL(blob);
                             const a = document.createElement('a');
                             a.href = url;
                             a.download = `POA_Walmart_${aiStoreName}_${new Date().toISOString().slice(0,10)}.txt`;
                             a.click();
                          }} className="flex-1 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">
                             <Download size={22} /> 下载申诉文书 (.txt)
                          </button>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-4 bg-gray-50/50">
               <button onClick={() => setEditingAppeal(null)} className="px-10 py-4 border-2 border-gray-200 rounded-2xl font-black text-gray-400 hover:bg-gray-100 transition-all">暂存并关闭</button>
               <button onClick={handleSaveAppealTask} disabled={loading} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
                  {loading ? <Loader2 className="animate-spin" /> : (isStaff ? '提交财务审批扣费' : '保存工单决策')}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
