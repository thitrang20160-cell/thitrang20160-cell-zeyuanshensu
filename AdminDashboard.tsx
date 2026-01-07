
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig } from './types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, updateAnyUser, getSystemConfig, saveSystemConfig, processDeductionWithCommission } from './services/storageService';
import { 
  CheckCircle, XCircle, Clock, Search, Edit3, DollarSign, 
  BrainCircuit, Save, X, Filter, Loader2, Bell,
  FileText, FileSpreadsheet, Download, File, QrCode, Upload, Users, ShieldAlert, Settings, AlertTriangle, TrendingUp, RefreshCw, Eye, Sparkles, BookOpen, Trash2, Copy, FilePlus, Link, Terminal, ListChecks, Calendar, Store, Hash, ChevronDown, ChevronRight, Layers, MessageSquarePlus, Table, Database, ExternalLink, Key, CreditCard, LifeBuoy, Info, Zap, PieChart, UserCheck, TrendingDown
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useToast } from './components/Toast';

declare global {
  interface Window {
    // Fix: Using any to bypass type conflict with pre-defined AIStudio type
    aistudio?: any;
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

  // Role Checks
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isStaff = currentUser.role === UserRole.ADMIN;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const isMarketing = currentUser.role === UserRole.MARKETING;

  // POA Generator State
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [aiPoaType, setAiPoaType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [aiPoaSubType, setAiPoaSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  const [aiRootCause, setAiRootCause] = useState('');
  const [aiStoreName, setAiStoreName] = useState('');
  const [aiPartnerId, setAiPartnerId] = useState('');
  const [aiMetricTarget, setAiMetricTarget] = useState('提升发货及时率至 99.5%');
  const [aiTone, setAiTone] = useState('专业且恳求');
  const [aiTableExtract, setAiTableExtract] = useState('');
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1);

  // Edit State
  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(0);

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
    // 默认页签分配
    if (isMarketing) setActiveTab('marketing_performance');
    if (isFinance) setActiveTab('finance_review');
  }, [loadData, isMarketing, isFinance]);

  const handleGeneratePOA = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      const prompt = `你是一位极具经验的沃尔玛高级申诉顾问。
      目标：撰写一份逻辑严密、情感饱满且数据详实的申诉信(POA)。
      参数设定：
      - 店铺: ${aiStoreName} (Partner ID: ${aiPartnerId})
      - 封店类型: ${aiPoaSubType}
      - 根本原因: ${aiRootCause}
      - 关键指标数据: ${aiTableExtract}
      - 改进目标: ${aiMetricTarget}
      - 负责人: 运营总监 ${staff.manager}, 仓库主管 ${staff.warehouse}
      - 语气设定: ${aiTone}
      
      撰写指南：
      1. 使用 5-Whys 分析法挖掘根本原因。
      2. 针对每一个指标异常点提出具体的 SOP 修正方案。
      3. 强调已经完成的人员培训和系统升级。
      4. 表达对沃尔玛平台规则的敬畏。
      5. 全文使用英文，格式专业。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      if (!response.text) throw new Error('AI 返回异常');
      setAiGeneratedText(response.text);
      setAiStep(2);
      showToast('专业 POA 已生成', 'success');
    } catch (err: any) {
      showToast('AI 生成失败: ' + err.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAppeal = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    
    // 如果员工标志着“通过”，则变为“待财务扣费”状态
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

    // 如果状态变为“待扣费”，自动创建一笔 PENDING 的扣费交易单
    if (finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION) {
      await saveTransaction({
        id: `deduct-${Date.now()}`,
        userId: editingAppeal.userId,
        username: editingAppeal.username,
        type: TransactionType.DEDUCTION,
        amount: editDeduction,
        status: TransactionStatus.PENDING,
        appealId: editingAppeal.id,
        note: `工单 ${editingAppeal.id.slice(-4)} 申诉通过，申请扣费`,
        createdAt: new Date().toISOString()
      });
      showToast('工单已提交财务审核扣费', 'info');
    } else {
      showToast('工单已更新', 'success');
    }

    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  const handleApproveTransaction = async (txId: string) => {
    setLoading(true);
    const res = await processDeductionWithCommission(txId, currentUser.id);
    if (res.success) {
      showToast('审批完成，提成已自动拨付', 'success');
      loadData();
    } else {
      showToast('审批失败: ' + res.error, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>申诉工作台</button>}
          {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>财务审批中心</button>}
          {isMarketing && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>营销业绩看板</button>}
          {isSuper && <button onClick={() => setActiveTab('system_settings')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'system_settings' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>全局配置</button>}
        </div>

        <div className="p-6">
          {/* 技术申诉台：员工和老板共享 */}
          {activeTab === 'appeals' && (
            <div className="animate-in fade-in duration-300">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2"><ListChecks className="text-indigo-600"/> 待处理案件</h3>
                  <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                     <input type="text" placeholder="搜索店铺邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-xl text-sm w-72 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="min-w-full">
                    <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                       <tr><th className="p-4 text-left">时间</th><th className="p-4 text-left">客户</th><th className="p-4 text-left">账号类型</th><th className="p-4 text-left">状态</th><th className="p-4 text-right">操作</th></tr>
                    </thead>
                    <tbody className="divide-y">
                       {appeals.filter(a => a.emailAccount.includes(searchTerm)).map(a => (
                         <tr key={a.id} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="p-4 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 text-sm font-bold">{a.username}</td>
                            <td className="p-4 text-sm"><span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{a.accountType}</span></td>
                            <td className="p-4">
                               <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${a.status === AppealStatus.PASSED ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                            </td>
                            <td className="p-4 text-right">
                               <button onClick={() => { setEditingAppeal(a); setEditStatus(a.status); setEditNote(a.adminNotes); setEditDeduction(a.deductionAmount || 200); }} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all">极速申诉</button>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* 财务审批台：财务和老板共享 */}
          {activeTab === 'finance_review' && (
            <div className="animate-in fade-in duration-300 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
                     <p className="text-xs text-green-600 font-bold uppercase mb-1">今日审批总额</p>
                     <p className="text-3xl font-black text-green-700">¥{transactions.filter(t => t.status === TransactionStatus.APPROVED && t.createdAt.startsWith(new Date().toISOString().slice(0,10))).reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</p>
                  </div>
                  <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                     <p className="text-xs text-indigo-600 font-bold uppercase mb-1">待审充值申请</p>
                     <p className="text-3xl font-black text-indigo-700">{transactions.filter(t => t.type === TransactionType.RECHARGE && t.status === TransactionStatus.PENDING).length} 笔</p>
                  </div>
                  <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                     <p className="text-xs text-amber-600 font-bold uppercase mb-1">待扣费申诉工单</p>
                     <p className="text-3xl font-black text-amber-700">{transactions.filter(t => t.type === TransactionType.DEDUCTION && t.status === TransactionStatus.PENDING).length} 笔</p>
                  </div>
               </div>
               
               <div className="bg-white border rounded-2xl overflow-hidden">
                  <div className="bg-gray-50 p-4 border-b font-bold text-gray-700 flex items-center gap-2"><DollarSign size={18}/> 待处理财务流水</div>
                  <div className="overflow-x-auto">
                     <table className="min-w-full">
                        <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase">
                           <tr><th className="p-4 text-left">客户</th><th className="p-4 text-left">类型</th><th className="p-4 text-left">金额</th><th className="p-4 text-left">备注</th><th className="p-4 text-right">操作</th></tr>
                        </thead>
                        <tbody>
                           {transactions.filter(t => t.status === TransactionStatus.PENDING).map(t => (
                             <tr key={t.id} className="border-t hover:bg-gray-50">
                                <td className="p-4 font-bold text-sm">{t.username}</td>
                                <td className="p-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${t.type === TransactionType.RECHARGE ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{t.type}</span></td>
                                <td className="p-4 font-mono font-bold">¥{t.amount}</td>
                                <td className="p-4 text-xs text-gray-500">{t.note}</td>
                                <td className="p-4 text-right space-x-2">
                                   <button onClick={() => handleApproveTransaction(t.id)} className="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-brand-100 hover:bg-brand-700 transition-all">批准</button>
                                   <button onClick={async () => { await saveTransaction({...t, status: TransactionStatus.REJECTED}); loadData(); }} className="px-4 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-bold hover:bg-red-50 transition-all">驳回</button>
                                </td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {/* 营销业绩看板：仅营销可见 */}
          {activeTab === 'marketing_performance' && (
             <div className="animate-in fade-in duration-300 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                   <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
                      <Zap className="absolute right-0 bottom-0 opacity-10" size={120} />
                      <p className="text-indigo-100 text-sm font-bold uppercase mb-2">我的邀请码</p>
                      <h4 className="text-4xl font-black tracking-tighter mb-4">{currentUser.marketingCode || '未设置'}</h4>
                      <p className="text-indigo-200 text-xs">当前提成比例: <span className="text-white font-bold">{(config?.commissionRate || 0) * 100}%</span></p>
                   </div>
                   <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                      <p className="text-gray-400 text-xs font-bold uppercase mb-1">可提现余额</p>
                      <p className="text-3xl font-black text-gray-900">¥{currentUser.balance.toFixed(2)}</p>
                   </div>
                   <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                      <p className="text-gray-400 text-xs font-bold uppercase mb-1">旗下客户总数</p>
                      <p className="text-3xl font-black text-indigo-600">{allUsers.filter(u => u.referredBy === currentUser.marketingCode).length}</p>
                   </div>
                </div>
                
                <div className="bg-white border border-gray-100 rounded-2xl p-6">
                   <h5 className="font-bold text-gray-800 mb-4">最近提成流水</h5>
                   <div className="space-y-3">
                      {transactions.filter(t => t.userId === currentUser.id && t.type === TransactionType.COMMISSION).slice(0, 10).map(t => (
                        <div key={t.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-indigo-50 transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-green-100 text-green-600 rounded-lg"><TrendingUp size={16}/></div>
                              <div>
                                 <p className="text-sm font-bold text-gray-900">{t.note}</p>
                                 <p className="text-[10px] text-gray-400">{new Date(t.createdAt).toLocaleString()}</p>
                              </div>
                           </div>
                           <p className="text-lg font-black text-green-600">+¥{t.amount.toFixed(2)}</p>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          )}

          {/* 老板端系统配置 */}
          {activeTab === 'system_settings' && (
            <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                     <h4 className="font-bold text-gray-800 flex items-center gap-2"><PieChart className="text-indigo-600" size={20}/> 业务结算配置</h4>
                     <div className="space-y-4">
                        <div>
                           <label className="block text-[10px] text-gray-400 font-bold uppercase mb-2">默认提成比例 (0.0 - 1.0)</label>
                           <input type="number" step="0.05" value={config?.commissionRate || 0} onChange={e => setConfig(prev => prev ? {...prev, commissionRate: parseFloat(e.target.value)} : null)} className="w-full border p-3 rounded-xl bg-gray-50 font-bold" />
                           <p className="text-[10px] text-gray-400 mt-1">例如输入 0.2 代表营销人员获得客户扣费金额的 20%</p>
                        </div>
                        <button onClick={async () => { if(config) { await saveSystemConfig(config); showToast('配置已全局更新', 'success'); } }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">保存结算配置</button>
                     </div>
                  </div>
                  
                  <div className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100 shadow-sm space-y-4">
                     <h4 className="font-bold text-indigo-900 flex items-center gap-2"><ShieldAlert size={20}/> 开发者 API 诊断</h4>
                     <p className="text-sm text-indigo-700">确保此处的 API 密钥已关联至拥有配额的 GCP 项目，否则 AI 功能将失效。</p>
                     <button onClick={() => window.aistudio?.openSelectKey()} className="w-full py-3 bg-white text-indigo-600 border border-indigo-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all">
                        <Key size={18}/> 关联/刷新 API Key
                     </button>
                  </div>
               </div>
               
               <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                  <h4 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Users size={20}/> 员工与营销账户管理</h4>
                  <div className="overflow-x-auto">
                     <table className="min-w-full">
                        <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase">
                           <tr><th className="p-4 text-left">用户名</th><th className="p-4 text-left">权限</th><th className="p-4 text-left">余额/佣金</th><th className="p-4 text-left">营销码</th><th className="p-4 text-right">管理</th></tr>
                        </thead>
                        <tbody>
                           {allUsers.filter(u => u.role !== UserRole.CLIENT).map(u => (
                             <tr key={u.id} className="border-t">
                                <td className="p-4 font-bold text-sm">{u.username}</td>
                                <td className="p-4 text-xs font-bold text-indigo-600">{u.role}</td>
                                <td className="p-4 font-mono text-sm">¥{u.balance.toFixed(2)}</td>
                                <td className="p-4 font-mono text-sm text-gray-400">{u.marketingCode || '-'}</td>
                                <td className="p-4 text-right">
                                   <button className="text-gray-400 hover:text-indigo-600"><Edit3 size={16}/></button>
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

      {/* 核心 AI 申诉处理弹窗 - 员工和老板共享完全一致的 UI */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-5 border-b flex justify-between items-center bg-gray-50/50">
               <div className="flex items-center gap-3">
                  <div className="bg-brand-100 p-2 rounded-lg text-brand-600"><Edit3 size={20}/></div>
                  <h3 className="font-bold text-gray-900 tracking-tight">高级申诉任务处理</h3>
               </div>
               <button onClick={() => setEditingAppeal(null)} className="p-2 hover:bg-200 rounded-full transition-colors"><X size={24}/></button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
               {/* 左侧：客户信息与任务状态 */}
               <div className="w-80 p-6 bg-gray-50/30 border-r overflow-y-auto space-y-6">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">任务详情</h4>
                    <div className="space-y-3">
                       <div className="bg-white p-4 rounded-2xl border shadow-sm">
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">店铺账号</p>
                          <p className="text-sm font-mono font-bold text-gray-900 break-all">{editingAppeal.emailAccount}</p>
                       </div>
                       <div className="bg-white p-4 rounded-2xl border shadow-sm">
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">环境与描述</p>
                          <p className="text-[10px] font-mono text-gray-500 whitespace-pre-wrap">{editingAppeal.loginInfo}</p>
                       </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                     <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">决策控制</h4>
                     <div className="space-y-4">
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-3 rounded-xl font-bold bg-white outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm">
                           {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className="w-full border p-4 text-sm rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none shadow-sm transition-all" placeholder="反馈给客户的说明..." />
                        <div className="bg-white p-4 rounded-2xl border shadow-sm">
                           <label className="block text-[10px] text-gray-400 font-bold uppercase mb-2">申诉单单价 (¥)</label>
                           <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full text-2xl font-black text-red-600 outline-none border-none p-0 focus:ring-0" />
                        </div>
                     </div>
                  </div>
               </div>

               {/* 右侧：高级 AI 撰写面板 (完全同步功能) */}
               <div className="flex-1 p-8 flex flex-col space-y-4 bg-white">
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2">
                        <Sparkles className="text-indigo-600" size={24} />
                        <h4 className="font-black text-xl text-gray-900 tracking-tight">Gemini 3 旗舰版 POA 生成内核</h4>
                     </div>
                     <div className="bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                        <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-widest">Enterprise Mode</span>
                     </div>
                  </div>

                  {aiStep === 1 ? (
                    <div className="space-y-4 overflow-y-auto pb-10">
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">店铺名称</label>
                             <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="Walmart Store Name" className="w-full border p-3 rounded-xl text-sm bg-gray-50 focus:bg-white transition-all outline-none" />
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Partner ID</label>
                             <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="PID 8位编码" className="w-full border p-3 rounded-xl text-sm bg-gray-50 focus:bg-white transition-all outline-none" />
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">申诉大类</label>
                             <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="w-full border p-3 rounded-xl text-sm bg-gray-50 outline-none">
                                {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                             </select>
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">申诉细项</label>
                             <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="w-full border p-3 rounded-xl text-sm bg-gray-50 outline-none">
                                {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">AI 语气调节</label>
                             <input value={aiTone} onChange={e => setAiTone(e.target.value)} className="w-full border p-3 rounded-xl text-sm bg-gray-50 outline-none" />
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">改进绩效目标</label>
                             <input value={aiMetricTarget} onChange={e => setAiMetricTarget(e.target.value)} className="w-full border p-3 rounded-xl text-sm bg-gray-50 outline-none" />
                          </div>
                       </div>
                       <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">核心原因 (Root Cause)</label>
                          <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border p-4 rounded-2xl text-sm bg-gray-50 outline-none focus:bg-white transition-all" placeholder="请简单描述为什么被暂停，AI 将自动扩展成专业话术..." />
                       </div>
                       <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">绩效表格原始数据提取 (可选)</label>
                          <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={4} className="w-full border p-4 rounded-2xl text-[10px] font-mono bg-gray-900 text-green-400 border-none shadow-inner" placeholder="在此粘贴绩效表格内容，AI 将进行数据建模分析..." />
                       </div>
                       <button onClick={handleGeneratePOA} disabled={isGenerating} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:bg-gray-400 active:scale-95">
                          {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />} 立即一键生成旗舰版 POA
                       </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col space-y-4 animate-in zoom-in-95 duration-500 min-h-0">
                       <div className="flex-1 bg-gray-50/50 p-10 border border-gray-100 rounded-[2.5rem] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800 shadow-inner scroll-smooth selection:bg-indigo-100">
                          {aiGeneratedText}
                       </div>
                       <div className="flex gap-4 pt-2 pb-6">
                          <button onClick={() => setAiStep(1)} className="px-8 py-4 border border-gray-200 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-colors">修正参数</button>
                          <button onClick={() => {
                             const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                             const url = window.URL.createObjectURL(blob);
                             const a = document.createElement('a');
                             a.href = url;
                             a.download = `POA_${aiStoreName}_${new Date().toISOString().slice(0,10)}.txt`;
                             a.click();
                          }} className="flex-1 bg-brand-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-brand-700 transition-all active:scale-95">
                             <Download size={20} /> 下载为标准文档 (.txt)
                          </button>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-5 border-t flex justify-end gap-4 bg-gray-50/50">
               <button onClick={() => setEditingAppeal(null)} className="px-8 py-3 border border-gray-200 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">暂时放弃</button>
               <button onClick={handleSaveAppeal} disabled={loading} className="px-12 py-3 bg-brand-600 text-white rounded-2xl font-bold shadow-xl shadow-brand-100 hover:bg-brand-700 transition-all active:scale-95">
                  {loading ? <Loader2 className="animate-spin" /> : (isStaff ? '提交审批扣费' : '保存工单')}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
