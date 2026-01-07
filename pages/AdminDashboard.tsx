
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig, KnowledgeBaseItem } from '../types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, getSystemConfig, saveSystemConfig, processDeductionAndCommission, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase } from '../services/storageService';
import { 
  CheckCircle, XCircle, Search, Edit3, DollarSign, 
  Save, X, Loader2, Bell, Download, Users, 
  ShieldAlert, TrendingUp, Sparkles, 
  Key, PieChart, RefreshCw, Zap,
  ListChecks, BookOpen, Trash2, FileSpreadsheet, Plus, Activity, Bot
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';

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
  
  // 核心权限判定
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isStaff = currentUser.role === UserRole.ADMIN;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const isMarketing = currentUser.role === UserRole.MARKETING;

  // 状态管理 - 使用回调函数初始化，确保页面加载瞬间就是正确的 Tab，避免白屏或闪烁
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (isMarketing) return 'marketing_performance';
    if (isFinance) return 'finance_review';
    if (isStaff) return 'appeals';
    return 'appeals'; // Super Admin 默认
  });

  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [kbItems, setKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // AI POA 逻辑
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [aiPoaType, setAiPoaType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [aiPoaSubType, setAiPoaSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  const [aiRootCause, setAiRootCause] = useState('');
  const [aiStoreName, setAiStoreName] = useState('');
  const [aiPartnerId, setAiPartnerId] = useState('');
  const [aiTableExtract, setAiTableExtract] = useState('');
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1);

  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(200);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t, u, c, k] = await Promise.all([
        getAppeals(), getTransactions(), getUsers(), getSystemConfig(), getKnowledgeBase()
      ]);
      setAppeals(a);
      setTransactions(t);
      setAllUsers(u);
      setConfig(c);
      setKbItems(k);
    } catch (e) {
      console.error(e);
      showToast('数据加载异常', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Excel 解析
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_csv(ws);
        setAiTableExtract(data);
        showToast('Excel 绩效数据已成功解析并注入 AI 上下文', 'success');
      } catch (err) {
        showToast('表格解析失败，请检查文件格式', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Gemini 生成
  const handleGeneratePOA = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      const prompt = `
        Role: Professional Walmart Appeal Expert.
        Task: Write a comprehensive Plan of Action (POA) for Store: ${aiStoreName} (PID: ${aiPartnerId}).
        Violation Type: ${aiPoaSubType}
        
        Root Cause Analysis (Input): ${aiRootCause}
        
        Performance Metrics (From Excel):
        ${aiTableExtract}
        
        Corrective Actions Team:
        - Manager: ${staff.manager}
        - Warehouse: ${staff.warehouse}
        
        Instructions:
        1. Use the 5-Whys technique to deepen the root cause.
        2. Provide specific, data-driven corrective actions based on the metrics provided.
        3. Tone: Professional, apologetic, and determined.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      
      if (response.text) {
        setAiGeneratedText(response.text);
        setAiStep(2);
        showToast('Gemini 3 已成功生成申诉文书', 'success');
      }
    } catch (err: any) {
      showToast('生成失败: 请检查 API 密钥状态', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAppealTask = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    let finalStatus = editStatus;
    if (isStaff && editStatus === AppealStatus.PASSED) finalStatus = AppealStatus.PASSED_PENDING_DEDUCTION;
    
    await saveAppeal({ ...editingAppeal, status: finalStatus, adminNotes: editNote, deductionAmount: editDeduction, updatedAt: new Date().toISOString() });
    
    if ((finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION || finalStatus === AppealStatus.PASSED) && editDeduction > 0) {
      await saveTransaction({ 
        id: `deduct-${Date.now()}`, 
        userId: editingAppeal.userId, 
        username: editingAppeal.username, 
        type: TransactionType.DEDUCTION, 
        amount: editDeduction, 
        status: isStaff ? TransactionStatus.PENDING : TransactionStatus.APPROVED, 
        appealId: editingAppeal.id, 
        note: `工单 ${editingAppeal.id.slice(-6)} 服务费`, 
        createdAt: new Date().toISOString() 
      });
      showToast('扣费申请已提交', 'info');
    } else {
      showToast('工单更新成功', 'success');
    }
    
    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  const handleOpenKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
    } else {
      showToast('无法打开密钥管理器', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部多角色导航 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>工单工作台</button>}
          {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>财务审核</button>}
          {isSuper && <button onClick={() => setActiveTab('knowledge_base')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'knowledge_base' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>智囊团 (AI Brain)</button>}
          {(isSuper || isMarketing) && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>营销业绩</button>}
          {isSuper && <button onClick={() => setActiveTab('user_management')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'user_management' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>员工管理</button>}
          {isSuper && <button onClick={() => setActiveTab('system_config')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'system_config' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>系统配置</button>}
        </div>

        <div className="p-6">
          {/* TAB 1: 申诉工作台 */}
          {activeTab === 'appeals' && (isSuper || isStaff) && (
            <div className="space-y-6 animate-in fade-in">
               <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><ListChecks className="text-indigo-600"/> 待处理案件</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="搜索客户..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-xl text-sm w-64 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
               </div>
               <div className="overflow-x-auto rounded-xl border">
                  <table className="min-w-full">
                     <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase">
                        <tr><th className="p-4 text-left">客户</th><th className="p-4 text-left">账号</th><th className="p-4 text-left">状态</th><th className="p-4 text-right">操作</th></tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {appeals.filter(a => a.emailAccount.includes(searchTerm)).map(a => (
                           <tr key={a.id} className="hover:bg-indigo-50/20">
                              <td className="p-4 font-bold text-sm">{a.username}</td>
                              <td className="p-4 text-xs font-mono text-gray-500">{a.emailAccount}</td>
                              <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold">{a.status}</span></td>
                              <td className="p-4 text-right">
                                 <button onClick={() => { setEditingAppeal(a); setEditStatus(a.status); setEditNote(a.adminNotes); setEditDeduction(a.deductionAmount || 200); }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all">处理</button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* TAB 2: 财务审核 */}
          {activeTab === 'finance_review' && (isSuper || isFinance) && (
            <div className="space-y-6 animate-in fade-in">
               <div className="flex items-center gap-2 font-bold text-gray-800"><DollarSign className="text-green-600"/> 资金流水审核</div>
               <div className="overflow-x-auto rounded-xl border">
                  <table className="min-w-full">
                     <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase">
                        <tr><th className="p-4 text-left">申请人</th><th className="p-4 text-left">类型</th><th className="p-4 text-left">金额</th><th className="p-4 text-right">操作</th></tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {transactions.filter(t => t.status === TransactionStatus.PENDING).map(t => (
                           <tr key={t.id} className="hover:bg-gray-50">
                              <td className="p-4 font-bold text-sm">{t.username}</td>
                              <td className="p-4 text-xs">{t.type}</td>
                              <td className="p-4 font-bold text-gray-900">¥{t.amount}</td>
                              <td className="p-4 text-right space-x-2">
                                 <button onClick={() => processDeductionAndCommission(t.id).then(() => { showToast('已入账', 'success'); loadData(); })} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-bold">批准</button>
                                 <button onClick={() => saveTransaction({...t, status: TransactionStatus.REJECTED}).then(loadData)} className="px-3 py-1 border text-red-500 rounded text-xs font-bold">驳回</button>
                              </td>
                           </tr>
                        ))}
                        {transactions.filter(t => t.status === TransactionStatus.PENDING).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400 text-sm">暂无待审核流水</td></tr>}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* TAB 3: 智囊团 */}
          {activeTab === 'knowledge_base' && isSuper && (
            <div className="space-y-6 animate-in fade-in">
               <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><Bot className="text-indigo-600"/> Gemini 3 知识库 (AI Brain)</h3>
                  <button className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg text-xs font-bold"><Plus size={14}/> 上传范文</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {kbItems.map(item => (
                    <div key={item.id} className="p-4 border rounded-xl hover:shadow-md transition-all relative group bg-white">
                       <h4 className="font-bold text-sm text-gray-900 mb-2">{item.title}</h4>
                       <p className="text-xs text-gray-500 line-clamp-3">{item.content}</p>
                       <button onClick={() => deleteFromKnowledgeBase(item.id).then(loadData)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 hidden group-hover:block"><Trash2 size={14}/></button>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* TAB 4: 营销业绩 */}
          {activeTab === 'marketing_performance' && (isSuper || isMarketing) && (
             <div className="animate-in fade-in space-y-6">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-2xl text-white shadow-lg relative overflow-hidden">
                   <Zap className="absolute right-0 bottom-0 opacity-10" size={120} />
                   <h4 className="text-2xl font-black mb-2">营销合伙人中心</h4>
                   <div className="flex gap-6 mt-4">
                      <div><p className="text-xs opacity-60 uppercase">累计佣金</p><p className="text-3xl font-bold">¥{currentUser.balance.toFixed(2)}</p></div>
                      <div><p className="text-xs opacity-60 uppercase">专属邀请码</p><p className="text-3xl font-mono font-bold">{currentUser.marketingCode || '未分配'}</p></div>
                   </div>
                </div>
                <div className="bg-white border rounded-xl p-6">
                   <h5 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><TrendingUp className="text-green-500"/> 收益明细</h5>
                   {transactions.filter(t => t.userId === currentUser.id && t.type === TransactionType.COMMISSION).map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
                         <span className="text-sm text-gray-600">{t.note}</span>
                         <span className="text-sm font-bold text-green-600">+¥{t.amount.toFixed(2)}</span>
                      </div>
                   ))}
                </div>
             </div>
          )}
          
          {/* TAB 5: 员工管理 (仅老板) */}
          {activeTab === 'user_management' && isSuper && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users className="text-indigo-600"/> 团队管理</h3>
              <div className="overflow-x-auto border rounded-xl">
                 <table className="min-w-full">
                   <thead className="bg-gray-50 text-xs text-gray-400 font-bold uppercase">
                     <tr><th className="p-3 text-left">用户</th><th className="p-3 text-left">角色</th><th className="p-3 text-left">余额</th></tr>
                   </thead>
                   <tbody>
                     {allUsers.map(u => (
                       <tr key={u.id} className="border-t hover:bg-gray-50">
                         <td className="p-3 text-sm font-bold">{u.username}</td>
                         <td className="p-3 text-sm"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">{u.role}</span></td>
                         <td className="p-3 text-sm">¥{u.balance}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* TAB 6: 系统配置 (仅老板) */}
          {activeTab === 'system_config' && isSuper && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                <div className="p-6 bg-white border rounded-2xl space-y-4">
                   <h4 className="font-bold flex items-center gap-2"><PieChart className="text-indigo-600"/> 数据修饰</h4>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500">营销基数 (Base Cases)</label>
                      <input type="number" value={config?.marketingBaseCases} onChange={e => setConfig(prev => prev ? {...prev, marketingBaseCases: Number(e.target.value)} : null)} className="w-full border p-2 rounded-lg bg-gray-50" />
                   </div>
                   <button onClick={() => config && saveSystemConfig(config).then(() => showToast('配置已保存', 'success'))} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">更新前台数据</button>
                </div>
                <div className="p-6 bg-gray-900 text-white rounded-2xl space-y-4 relative overflow-hidden">
                   <Key className="absolute right-[-10px] top-[-10px] opacity-10" size={100} />
                   <h4 className="font-bold flex items-center gap-2"><RefreshCw/> API 密钥管理</h4>
                   <p className="text-xs text-gray-400">当前运行模型: <span className="text-green-400 font-mono">gemini-3-flash-preview</span></p>
                   <button onClick={handleOpenKey} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                     启动密钥选择器
                   </button>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* 核心功能：POA 生成弹窗 */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                 <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg"><Activity size={20}/></div>
                    <div>
                       <h3 className="font-bold text-gray-900">申诉工作站</h3>
                       <p className="text-xs text-gray-500">{editingAppeal.emailAccount}</p>
                    </div>
                 </div>
                 <button onClick={() => setEditingAppeal(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={24}/></button>
              </div>
              
              <div className="flex-1 flex overflow-hidden">
                 {/* 左侧：人工决策 */}
                 <div className="w-80 p-6 bg-gray-50/50 border-r overflow-y-auto space-y-6">
                    <div>
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">决策控制</h4>
                       <div className="space-y-3">
                          <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-3 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm">
                             {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className="w-full border p-3 rounded-xl text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="回复内容..." />
                          <div className="bg-white p-3 rounded-xl border shadow-sm">
                             <label className="text-[10px] font-bold text-gray-400 uppercase">预扣费 (¥)</label>
                             <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full text-xl font-black text-indigo-600 outline-none mt-1" />
                          </div>
                       </div>
                    </div>
                    <div className="pt-4 border-t">
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">环境信息</h4>
                       <p className="text-xs bg-white p-3 rounded-xl border text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{editingAppeal.loginInfo}</p>
                    </div>
                 </div>

                 {/* 右侧：Gemini 3 建模引擎 */}
                 <div className="flex-1 p-8 flex flex-col bg-white overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                       <h4 className="text-2xl font-black text-gray-900 flex items-center gap-3"><Sparkles className="text-indigo-600"/> Gemini 3 深度建模</h4>
                       <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-100">
                             <Bot size={14}/> Powered by Gemini 3.0
                          </div>
                          <div className="relative">
                             <input type="file" id="excel-up" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
                             <label htmlFor="excel-up" className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-100 transition-colors">
                                <FileSpreadsheet size={16}/> 导入 Excel 绩效表
                             </label>
                          </div>
                       </div>
                    </div>

                    {aiStep === 1 ? (
                       <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                          <div className="grid grid-cols-2 gap-4">
                             <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名称" className="border p-4 rounded-xl text-sm font-bold bg-gray-50 outline-none focus:bg-white transition-all" />
                             <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="Partner ID" className="border p-4 rounded-xl text-sm font-bold bg-gray-50 outline-none focus:bg-white transition-all" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="border p-4 rounded-xl text-sm font-bold bg-gray-50 outline-none focus:bg-white transition-all">
                                {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                             </select>
                             <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="border p-4 rounded-xl text-sm font-bold bg-gray-50 outline-none focus:bg-white transition-all">
                                {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                          </div>
                          <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border p-4 rounded-xl text-sm font-bold bg-gray-50 outline-none focus:bg-white transition-all" placeholder="简述根本原因..." />
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Context Data (从 Excel 自动提取)</label>
                             <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={5} className="w-full border-none p-4 rounded-xl text-xs font-mono bg-gray-900 text-green-400 shadow-inner" placeholder="等待 Excel 数据注入..." />
                          </div>
                          <button onClick={handleGeneratePOA} disabled={isGenerating} className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black text-lg flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95">
                             {isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>} 启动生成引擎
                          </button>
                       </div>
                    ) : (
                       <div className="flex-1 flex flex-col space-y-4 min-h-0 animate-in fade-in slide-in-from-bottom-4">
                          <div className="flex-1 bg-gray-50 border rounded-2xl p-8 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800 shadow-inner">{aiGeneratedText}</div>
                          <div className="flex gap-4 pt-2">
                             <button onClick={() => setAiStep(1)} className="px-8 py-4 border rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors">重新调整</button>
                             <button onClick={() => {
                                const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `POA_${aiStoreName}.txt`;
                                a.click();
                             }} className="flex-1 bg-indigo-600 text-white rounded-xl font-black text-lg flex items-center justify-center gap-2 shadow-xl hover:bg-indigo-700 transition-colors active:scale-95">
                                <Download size={20}/> 下载 POA 文书
                             </button>
                          </div>
                       </div>
                    )}
                 </div>
              </div>

              <div className="p-5 border-t bg-gray-50 flex justify-end gap-4">
                 <button onClick={() => setEditingAppeal(null)} className="px-8 py-3 border rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">取消</button>
                 <button onClick={handleSaveAppealTask} disabled={loading} className="px-12 py-3 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
                    {loading ? <Loader2 className="animate-spin"/> : '确认并通知客户'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
