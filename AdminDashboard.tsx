
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig, KnowledgeBaseItem } from './types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, updateAnyUser, getSystemConfig, saveSystemConfig, processDeductionAndCommission, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase } from './services/storageService';
import { 
  CheckCircle, XCircle, Clock, Search, Edit3, DollarSign, 
  Save, X, Filter, Loader2, Bell, Download, File, Users, 
  ShieldAlert, Settings, AlertTriangle, TrendingUp, Sparkles, 
  Key, CreditCard, PieChart, RefreshCw, Zap, UserCheck, MessageSquarePlus, 
  ExternalLink, Info, Activity, ListChecks, BookOpen, Trash2, FileSpreadsheet, Plus
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useToast } from './components/Toast';
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
  const [activeTab, setActiveTab] = useState<string>('appeals');
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [kbItems, setKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 角色权限细分
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isStaff = currentUser.role === UserRole.ADMIN;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const isMarketing = currentUser.role === UserRole.MARKETING;

  // AI POA 逻辑
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [aiPoaType, setAiPoaType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [aiPoaSubType, setAiPoaSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  const [aiRootCause, setAiRootCause] = useState('');
  const [aiStoreName, setAiStoreName] = useState('');
  const [aiPartnerId, setAiPartnerId] = useState('');
  const [aiMetricTarget, setAiMetricTarget] = useState('提升发货及时率至 99.5%');
  const [aiTone, setAiTone] = useState('专业且诚恳');
  const [aiTableExtract, setAiTableExtract] = useState('');
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1);

  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(200);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [a, t, u, c, k] = await Promise.all([
      getAppeals(), getTransactions(), getUsers(), getSystemConfig(), getKnowledgeBase()
    ]);
    setAppeals(a);
    setTransactions(t);
    setAllUsers(u);
    setConfig(c);
    setKbItems(k);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // 默认页签分配
    if (isMarketing) setActiveTab('marketing_performance');
    if (isFinance) setActiveTab('finance_review');
  }, [loadData, isMarketing, isFinance]);

  // Excel 数据解析
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_txt(ws);
      setAiTableExtract(data);
      showToast('Excel 数据已成功提取至 AI 分析框', 'success');
    };
    reader.readAsBinaryString(file);
  };

  const handleGeneratePOA = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      const prompt = `你是沃尔玛申诉专家。为店铺 ${aiStoreName} 撰写 POA。\n原因: ${aiPoaSubType}\n核心数据: ${aiTableExtract}\n负责人: ${staff.manager}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      setAiGeneratedText(response.text || '');
      setAiStep(2);
      showToast('AI POA 已生成', 'success');
    } catch (err: any) {
      showToast('生成失败: ' + err.message, 'error');
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
    if (finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION) {
      await saveTransaction({ id: `deduct-${Date.now()}`, userId: editingAppeal.userId, username: editingAppeal.username, type: TransactionType.DEDUCTION, amount: editDeduction, status: TransactionStatus.PENDING, appealId: editingAppeal.id, note: `工单申请扣费`, createdAt: new Date().toISOString() });
    }
    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  const handleOpenKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        showToast('API 密钥选择器已打开', 'info');
      }
    } catch (e) {
      showToast('无法启动密钥选择器', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部导航控制 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>申诉工作台</button>}
          {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>财务审批</button>}
          {isSuper && <button onClick={() => setActiveTab('knowledge_base')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'knowledge_base' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>AI 智囊团</button>}
          {isMarketing && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>营销业绩</button>}
          {isSuper && <button onClick={() => setActiveTab('user_management')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'user_management' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>员工管理</button>}
          {isSuper && <button onClick={() => setActiveTab('system_config')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'system_config' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500'}`}>全局配置</button>}
        </div>

        <div className="p-6">
          {/* 老板/财务：财务审核页签 */}
          {activeTab === 'finance_review' && (
            <div className="space-y-6">
               <h3 className="text-lg font-bold flex items-center gap-2"><DollarSign className="text-green-600"/> 待审核交易</h3>
               <table className="min-w-full">
                  <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                     <tr><th className="p-4 text-left">客户</th><th className="p-4 text-left">类型</th><th className="p-4 text-left">金额</th><th className="p-4 text-right">操作</th></tr>
                  </thead>
                  <tbody>
                     {transactions.filter(t => t.status === TransactionStatus.PENDING).map(t => (
                        <tr key={t.id} className="border-t">
                           <td className="p-4 font-bold">{t.username}</td>
                           <td className="p-4">{t.type}</td>
                           <td className="p-4 font-mono font-bold text-gray-900">¥{t.amount.toFixed(2)}</td>
                           <td className="p-4 text-right space-x-2">
                              <button onClick={() => processDeductionAndCommission(t.id).then(() => loadData())} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold">批准</button>
                              <button className="px-4 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-bold">驳回</button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          )}

          {/* 申诉工作台 */}
          {activeTab === 'appeals' && (
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold flex items-center gap-2"><ListChecks className="text-indigo-600"/> 案件库</h3>
                  <input type="text" placeholder="搜索店铺邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border p-2 rounded-xl text-sm w-64" />
               </div>
               <table className="min-w-full">
                  <thead className="bg-gray-50 text-xs text-gray-400 uppercase">
                     <tr><th className="p-4 text-left">客户</th><th className="p-4 text-left">邮箱</th><th className="p-4 text-left">状态</th><th className="p-4 text-right">操作</th></tr>
                  </thead>
                  <tbody>
                     {appeals.filter(a => a.emailAccount.includes(searchTerm)).map(a => (
                        <tr key={a.id} className="border-t hover:bg-indigo-50/20">
                           <td className="p-4 font-bold">{a.username}</td>
                           <td className="p-4 font-mono">{a.emailAccount}</td>
                           <td className="p-4 text-xs">{a.status}</td>
                           <td className="p-4 text-right">
                              <button onClick={() => { setEditingAppeal(a); setEditStatus(a.status); setEditNote(a.adminNotes); setEditDeduction(a.deductionAmount || 200); }} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">极速处理</button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          )}

          {/* 老板：AI 智囊团 */}
          {activeTab === 'knowledge_base' && (
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold flex items-center gap-2"><BookOpen className="text-indigo-600"/> 智囊团知识库</h3>
                  <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm"><Plus size={16}/> 新增范文</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {kbItems.map(item => (
                    <div key={item.id} className="p-5 border rounded-2xl space-y-3">
                       <h4 className="font-bold text-gray-900">{item.title}</h4>
                       <p className="text-xs text-gray-500 line-clamp-2">{item.content}</p>
                       <div className="flex justify-between items-center pt-2">
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded">{item.subType}</span>
                          <button onClick={() => deleteFromKnowledgeBase(item.id).then(() => loadData())} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* 老板：用户/员工管理 */}
          {activeTab === 'user_management' && (
             <div className="space-y-6">
                <h3 className="text-lg font-bold">账户架构管理</h3>
                <table className="min-w-full">
                   <thead><tr className="text-xs text-gray-400"><th>用户名</th><th>角色</th><th>余额</th><th>营销码</th><th>操作</th></tr></thead>
                   <tbody>
                      {allUsers.map(u => (
                        <tr key={u.id} className="border-t text-sm">
                           <td className="p-3 font-bold">{u.username}</td>
                           <td className="p-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{u.role}</span></td>
                           <td className="p-3">¥{u.balance.toFixed(2)}</td>
                           <td className="p-3 font-mono">{u.marketingCode || '-'}</td>
                           <td className="p-3 text-right"><button className="text-indigo-600 font-bold">编辑角色</button></td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          )}

          {/* 老板：全局配置 */}
          {activeTab === 'system_config' && (
             <div className="max-w-4xl space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="p-6 bg-white border rounded-3xl space-y-4">
                      <h4 className="font-bold flex items-center gap-2"><PieChart size={20}/> 营销统计配置 (客户端显示)</h4>
                      <div className="space-y-3">
                         <div><label className="text-xs">累计通过数 (基数)</label><input type="number" value={config?.marketingBaseCases} onChange={e => setConfig(prev => prev ? {...prev, marketingBaseCases: Number(e.target.value)} : null)} className="w-full border p-2 rounded-xl" /></div>
                         <div><label className="text-xs">官方显示通过率 (%)</label><input type="text" value={config?.marketingSuccessRate} onChange={e => setConfig(prev => prev ? {...prev, marketingSuccessRate: e.target.value} : null)} className="w-full border p-2 rounded-xl" /></div>
                      </div>
                   </div>
                   <div className="p-6 bg-indigo-600 text-white rounded-3xl space-y-4">
                      <h4 className="font-bold flex items-center gap-2"><Key size={20}/> 系统 API 诊断</h4>
                      <p className="text-xs opacity-80">当前系统基于 Gemini 3 旗舰模型。如遇生成失败请检查结算账户。</p>
                      <button onClick={handleOpenKey} className="w-full py-3 bg-white/20 border border-white/30 rounded-xl font-bold hover:bg-white/30 transition-all">重新选择 API 密钥</button>
                   </div>
                </div>
                <button onClick={() => config && saveSystemConfig(config).then(() => showToast('系统配置已生效', 'success'))} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold">保存所有配置</button>
             </div>
          )}
        </div>
      </div>

      {/* 增强型 AI 申诉弹窗 (支持 Excel 解析) */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
           <div className="bg-white rounded-3xl shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-5 border-b flex justify-between items-center bg-gray-50/50">
                 <h3 className="font-bold text-gray-900 flex items-center gap-2"><Sparkles className="text-indigo-600"/> 高级申诉处理控制台</h3>
                 <button onClick={() => setEditingAppeal(null)} className="p-2 hover:bg-gray-200 rounded-full"><X size={24}/></button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                 <div className="w-80 p-6 bg-gray-50 border-r overflow-y-auto space-y-6">
                    <div className="space-y-4">
                       <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">任务详情</h4>
                       <div className="bg-white p-4 rounded-2xl border text-sm space-y-2">
                          <p><b>邮箱:</b> {editingAppeal.emailAccount}</p>
                          <p><b>登录:</b> <span className="text-xs font-mono">{editingAppeal.loginInfo}</span></p>
                       </div>
                       <div className="pt-4 border-t space-y-4">
                          <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-3 rounded-xl font-bold outline-none">
                             {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className="w-full border p-4 text-xs rounded-2xl outline-none" placeholder="回复客户..." />
                          <div className="bg-indigo-600 p-5 rounded-2xl text-white">
                             <label className="text-[10px] opacity-60 uppercase font-bold">申诉扣费 (¥)</label>
                             <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full text-3xl font-black bg-transparent border-none p-0 outline-none focus:ring-0" />
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="flex-1 p-8 flex flex-col space-y-4 bg-white overflow-hidden">
                    <div className="flex justify-between items-center">
                       <h4 className="font-bold text-2xl flex items-center gap-2"><Activity className="text-indigo-600"/> Gemini 3 深度申诉建模</h4>
                       <div className="relative">
                          <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" id="excel-up" />
                          <label htmlFor="excel-up" className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-sm cursor-pointer hover:bg-indigo-100 transition-all">
                             <FileSpreadsheet size={16}/> 解析绩效表格 (Excel)
                          </label>
                       </div>
                    </div>

                    {aiStep === 1 ? (
                       <div className="space-y-4 overflow-y-auto pb-10">
                          <div className="grid grid-cols-2 gap-4">
                             <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名" className="border p-3 rounded-xl text-sm" />
                             <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="Partner ID" className="border p-3 rounded-xl text-sm" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="border p-3 rounded-xl text-sm">
                                {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                             </select>
                             <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="border p-3 rounded-xl text-sm font-bold">
                                {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                          </div>
                          <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border p-4 rounded-xl text-sm" placeholder="核心封店原因描述..." />
                          <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={5} className="w-full border-none p-4 rounded-xl text-[10px] font-mono bg-gray-900 text-green-400 shadow-inner" placeholder="Excel 提取数据或手动粘贴表格文本..." />
                          <button onClick={handleGeneratePOA} disabled={isGenerating} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
                             {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />} 启动旗舰版 AI 生成
                          </button>
                       </div>
                    ) : (
                       <div className="flex-1 flex flex-col space-y-4 min-h-0">
                          <div className="flex-1 bg-gray-50 p-10 border rounded-[2.5rem] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800">{aiGeneratedText}</div>
                          <div className="flex gap-4 pt-2">
                             <button onClick={() => setAiStep(1)} className="px-8 py-3 border rounded-2xl font-bold text-gray-400">重新调整</button>
                             <button onClick={() => {
                                const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `POA_${aiStoreName}.txt`;
                                a.click();
                             }} className="flex-1 bg-indigo-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl"><Download size={20}/> 下载 POA</button>
                          </div>
                       </div>
                    )}
                 </div>
              </div>
              <div className="p-5 border-t flex justify-end gap-4 bg-gray-50/50">
                 <button onClick={() => setEditingAppeal(null)} className="px-8 py-3 border rounded-2xl font-bold text-gray-400">取消</button>
                 <button onClick={handleSaveAppealTask} disabled={loading} className="px-12 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-xl">
                    {loading ? <Loader2 className="animate-spin" /> : (isStaff ? '提交审核扣费' : '完成处理')}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
