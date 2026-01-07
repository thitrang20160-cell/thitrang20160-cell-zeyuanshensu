
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig, KnowledgeBaseItem } from './types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, updateAnyUser, getSystemConfig, saveSystemConfig, processDeductionAndCommission, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase } from './services/storageService';
import { 
  CheckCircle, XCircle, Clock, Search, Edit3, DollarSign, 
  Save, X, Filter, Loader2, Bell, Download, File, Users, 
  ShieldAlert, Settings, AlertTriangle, TrendingUp, Sparkles, 
  Key, CreditCard, PieChart, RefreshCw, Zap, UserCheck, MessageSquarePlus, 
  ExternalLink, Info, Activity, ListChecks, BookOpen, Trash2, FileSpreadsheet, Plus, Share2, ClipboardList
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

  // 核心权限判定
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
  const [aiMetricTarget, setAiMetricTarget] = useState('提升发货及时率至 99.5% 以上');
  const [aiTone, setAiTone] = useState('专业且充满诚意');
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
    // 强制根据角色设置初始 Tab，防止白屏
    if (isMarketing) setActiveTab('marketing_performance');
    else if (isFinance) setActiveTab('finance_review');
    else setActiveTab('appeals');
  }, [loadData, isMarketing, isFinance]);

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
        const data = XLSX.utils.sheet_to_txt(ws);
        setAiTableExtract(data);
        showToast('Excel 绩效数据分析成功，已填入建模框', 'success');
      } catch (err) {
        showToast('表格解析失败', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleGeneratePOA = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      const prompt = `你是沃尔玛申诉顾问。为店铺 ${aiStoreName} (PID: ${aiPartnerId}) 撰写 POA。\n细项: ${aiPoaSubType}\n核心数据: ${aiTableExtract}\n改进目标: ${aiMetricTarget}\n根本原因: ${aiRootCause}\n负责人: ${staff.manager}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      setAiGeneratedText(response.text || '');
      setAiStep(2);
      showToast('AI POA 已完成深度分析并生成', 'success');
    } catch (err: any) {
      showToast('生成失败，请检查 API 密钥状态', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAppealTask = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    let finalStatus = editStatus;
    // 员工通过工单需转交财务扣费
    if (isStaff && editStatus === AppealStatus.PASSED) finalStatus = AppealStatus.PASSED_PENDING_DEDUCTION;
    
    await saveAppeal({ ...editingAppeal, status: finalStatus, adminNotes: editNote, deductionAmount: editDeduction, updatedAt: new Date().toISOString() });
    
    if (finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION) {
      await saveTransaction({ 
        id: `deduct-${Date.now()}`, 
        userId: editingAppeal.userId, 
        username: editingAppeal.username, 
        type: TransactionType.DEDUCTION, 
        amount: editDeduction, 
        status: TransactionStatus.PENDING, 
        appealId: editingAppeal.id, 
        note: `工单 ${editingAppeal.id.slice(-4)} 提交结算`, 
        createdAt: new Date().toISOString() 
      });
      showToast('工单已提交财务处理扣费', 'info');
    } else {
      showToast('处理记录已更新', 'success');
    }
    
    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  const handleOpenKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        showToast('API 密钥管理器已启动', 'info');
      } else {
        showToast('当前环境不支持密钥管理器，请检查插件', 'error');
      }
    } catch (e) {
      showToast('打开密钥选择器失败', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部多角色自适应导航 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>申诉工作台</button>}
          {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>充值与扣费审核</button>}
          {isSuper && <button onClick={() => setActiveTab('knowledge_base')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'knowledge_base' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>AI 智囊团管理</button>}
          {(isSuper || isMarketing) && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>营销业绩看板</button>}
          {isSuper && <button onClick={() => setActiveTab('user_management')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'user_management' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>组织与角色管理</button>}
          {isSuper && <button onClick={() => setActiveTab('system_config')} className={`flex-1 py-4 px-6 text-sm font-bold transition-all ${activeTab === 'system_config' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>系统全局配置</button>}
        </div>

        <div className="p-6">
          {/* TAB: 申诉工作台 */}
          {activeTab === 'appeals' && (
            <div className="space-y-6 animate-in fade-in duration-300">
               <div className="flex justify-between items-center">
                  <h3 className="text-lg font-black flex items-center gap-2 text-gray-800"><ListChecks className="text-indigo-600"/> 实时案件库</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="搜索店铺邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-xl text-sm w-72 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
               </div>
               <div className="overflow-x-auto rounded-xl border">
                  <table className="min-w-full">
                     <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        <tr><th className="p-4 text-left">客户</th><th className="p-4 text-left">账号邮箱</th><th className="p-4 text-left">当前状态</th><th className="p-4 text-right">管理</th></tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 bg-white">
                        {appeals.filter(a => a.emailAccount.includes(searchTerm)).map(a => (
                           <tr key={a.id} className="hover:bg-indigo-50/20 transition-colors">
                              <td className="p-4 font-bold text-gray-900">{a.username}</td>
                              <td className="p-4 font-mono text-xs text-gray-500">{a.emailAccount}</td>
                              <td className="p-4"><span className={`px-2 py-1 rounded text-[10px] font-bold ${a.status === AppealStatus.PASSED ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-700'}`}>{a.status}</span></td>
                              <td className="p-4 text-right">
                                 <button onClick={() => { setEditingAppeal(a); setEditStatus(a.status); setEditNote(a.adminNotes); setEditDeduction(a.deductionAmount || 200); }} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:shadow-lg shadow-indigo-100 transition-all">处理工单</button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* TAB: 财务审批 (老板与财务可见) */}
          {activeTab === 'finance_review' && (
            <div className="space-y-6 animate-in fade-in duration-300">
               <div className="flex items-center gap-2 font-black text-gray-800"><DollarSign className="text-green-600"/> 财务核销流水</div>
               <div className="overflow-x-auto rounded-xl border">
                  <table className="min-w-full">
                     <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase">
                        <tr><th className="p-4 text-left">申请人</th><th className="p-4 text-left">流水类型</th><th className="p-4 text-left">涉及金额</th><th className="p-4 text-right">审批动作</th></tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {transactions.filter(t => t.status === TransactionStatus.PENDING).map(t => (
                           <tr key={t.id} className="hover:bg-gray-50">
                              <td className="p-4 font-bold">{t.username}</td>
                              <td className="p-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${t.type === TransactionType.RECHARGE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span></td>
                              <td className="p-4 font-black">¥{t.amount.toFixed(2)}</td>
                              <td className="p-4 text-right space-x-2">
                                 <button onClick={() => processDeductionAndCommission(t.id).then(() => { showToast('审批已入账','success'); loadData(); })} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold">批准并入账</button>
                                 <button onClick={async () => { await saveTransaction({...t, status: TransactionStatus.REJECTED}); loadData(); }} className="px-4 py-1.5 border text-red-500 rounded-lg text-xs font-bold hover:bg-red-50">驳回申请</button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* TAB: AI 智囊团 (老板专有) */}
          {activeTab === 'knowledge_base' && isSuper && (
            <div className="space-y-6 animate-in fade-in duration-300">
               <div className="flex justify-between items-center">
                  <h3 className="text-lg font-black flex items-center gap-2"><BookOpen className="text-indigo-600"/> 智囊团范文库管理</h3>
                  <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100"><Plus size={16}/> 新增申诉模板</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kbItems.map(item => (
                    <div key={item.id} className="p-5 bg-white border rounded-2xl shadow-sm hover:shadow-md transition-all space-y-3 group">
                       <h4 className="font-bold text-gray-900 group-hover:text-indigo-600">{item.title}</h4>
                       <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{item.content}</p>
                       <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md font-bold uppercase tracking-tighter">{item.subType}</span>
                          <button onClick={() => deleteFromKnowledgeBase(item.id).then(() => { showToast('范文已移出智囊团', 'info'); loadData(); })} className="text-red-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* TAB: 营销业绩看板 (老板与营销可见) */}
          {activeTab === 'marketing_performance' && (
             <div className="animate-in fade-in duration-300 space-y-6">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
                   <Zap className="absolute right-0 bottom-0 opacity-10" size={140} />
                   <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mb-1">我的推广身份</p>
                   <h4 className="text-4xl font-black mb-4">{isSuper ? '系统超级账户' : (currentUser.marketingCode || '暂无邀请码')}</h4>
                   <div className="flex gap-4">
                      <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20 text-xs">提成比例: <span className="font-bold">{(config?.commissionRate || 0)*100}%</span></div>
                      <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20 text-xs">累计收益: <span className="font-bold">¥{currentUser.balance.toFixed(2)}</span></div>
                   </div>
                </div>
                <div className="bg-white border rounded-2xl p-6">
                   <h5 className="font-black text-gray-800 mb-6 flex items-center gap-2"><TrendingUp className="text-green-500"/> 提成结算流水 (24H 实时)</h5>
                   <div className="space-y-3">
                      {transactions.filter(t => t.userId === currentUser.id && t.type === TransactionType.COMMISSION).slice(0, 10).map(t => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-indigo-100">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-green-100 text-green-600 rounded-lg"><Zap size={14}/></div>
                              <span className="text-xs font-bold text-gray-700">{t.note}</span>
                           </div>
                           <span className="font-black text-green-600">+¥{t.amount.toFixed(2)}</span>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          )}

          {/* TAB: 员工管理 (老板专有) */}
          {activeTab === 'user_management' && isSuper && (
            <div className="space-y-6 animate-in fade-in duration-300">
               <h3 className="text-lg font-black text-gray-800 flex items-center gap-2"><Users className="text-indigo-600"/> 团队组织架构</h3>
               <div className="overflow-x-auto rounded-xl border">
                  <table className="min-w-full bg-white">
                     <thead className="bg-gray-50 text-[10px] text-gray-400 font-bold uppercase">
                        <tr><th className="p-4 text-left">用户名</th><th className="p-4 text-left">职能角色</th><th className="p-4 text-left">账户余额/佣金</th><th className="p-4 text-left">营销识别码</th><th className="p-4 text-right">修改设置</th></tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {allUsers.map(u => (
                           <tr key={u.id} className="hover:bg-gray-50">
                              <td className="p-4 font-bold text-sm">{u.username}</td>
                              <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${u.role === UserRole.SUPER_ADMIN ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'}`}>{u.role}</span></td>
                              <td className="p-4 font-mono text-sm font-bold text-gray-600">¥{u.balance.toFixed(2)}</td>
                              <td className="p-4 font-mono text-xs text-gray-400">{u.marketingCode || '-'}</td>
                              <td className="p-4 text-right">
                                 <button onClick={() => showToast('员工管理功能优化中','info')} className="text-indigo-400 hover:text-indigo-600"><Edit3 size={16}/></button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* TAB: 系统全局配置 (老板专有) */}
          {activeTab === 'system_config' && isSuper && (
             <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="p-8 bg-white border rounded-[2rem] shadow-sm space-y-6">
                      <h4 className="font-black text-lg text-gray-800 flex items-center gap-2"><PieChart size={22} className="text-indigo-600"/> 客户端营销统计控制</h4>
                      <div className="space-y-4">
                         <div>
                            <label className="text-[10px] text-gray-400 font-black uppercase mb-1">累计成功案例基数</label>
                            <input type="number" value={config?.marketingBaseCases} onChange={e => setConfig(prev => prev ? {...prev, marketingBaseCases: Number(e.target.value)} : null)} className="w-full border p-3 rounded-xl font-black text-indigo-600 bg-gray-50" />
                         </div>
                         <div>
                            <label className="text-[10px] text-gray-400 font-black uppercase mb-1">通过率显示百分比 (%)</label>
                            <input type="text" value={config?.marketingSuccessRate} onChange={e => setConfig(prev => prev ? {...prev, marketingSuccessRate: e.target.value} : null)} className="w-full border p-3 rounded-xl font-black text-green-600 bg-gray-50" />
                         </div>
                         <div>
                            <label className="text-[10px] text-gray-400 font-black uppercase mb-1">默认提成比例 (0-1.0)</label>
                            <input type="number" step="0.05" value={config?.commissionRate} onChange={e => setConfig(prev => prev ? {...prev, commissionRate: parseFloat(e.target.value)} : null)} className="w-full border p-3 rounded-xl font-black bg-gray-50" />
                         </div>
                      </div>
                      <button onClick={() => config && saveSystemConfig(config).then(() => showToast('营销配置已实时刷新', 'success'))} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all">保存配置并刷新前台</button>
                   </div>
                   
                   <div className="p-8 bg-indigo-600 text-white rounded-[2rem] shadow-2xl space-y-6 relative overflow-hidden">
                      <ShieldAlert className="absolute -right-4 -top-4 opacity-10" size={140} />
                      <h4 className="font-black text-lg flex items-center gap-2"><Key size={22}/> AI 核心架构设置</h4>
                      <p className="text-xs text-indigo-100">当前运行环境：Gemini 3 Pro + GPT-4o 混合大脑。如遇 API 连接超时，请在此重新关联密钥。</p>
                      <button onClick={handleOpenKey} className="w-full py-4 bg-white/20 border border-white/30 rounded-2xl font-black hover:bg-white/30 transition-all flex items-center justify-center gap-2">
                        <RefreshCw size={18}/> 启动 API 密钥管理器对话框
                      </button>
                      <div className="pt-4 border-t border-white/10">
                         <p className="text-[10px] font-bold opacity-60 mb-2 uppercase tracking-widest">系统联系信息 (展示在客户端)</p>
                         <textarea value={config?.contactInfo} onChange={e => setConfig(prev => prev ? {...prev, contactInfo: e.target.value} : null)} className="w-full bg-white/10 border border-white/20 p-3 rounded-xl text-xs outline-none focus:bg-white/20 transition-all" rows={2} />
                      </div>
                   </div>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* 工单处理弹窗 (支持 Excel 读取深度分析) */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-7xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
              <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                 <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg"><Activity size={24}/></div>
                    <div>
                       <h3 className="font-black text-xl text-gray-900 tracking-tight">旗舰版 AI 申诉工作站</h3>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Current Task: {editingAppeal.emailAccount}</p>
                    </div>
                 </div>
                 <button onClick={() => setEditingAppeal(null)} className="p-2 hover:bg-gray-200 rounded-full transition-all text-gray-400 hover:text-gray-600"><X size={28}/></button>
              </div>
              
              <div className="flex-1 flex overflow-hidden">
                 {/* 决策操作区 */}
                 <div className="w-80 p-8 bg-gray-50/50 border-r overflow-y-auto space-y-8">
                    <div>
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">执行决策</h4>
                       <div className="space-y-4">
                          <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border-2 border-transparent p-4 rounded-2xl font-black bg-white shadow-sm outline-none focus:border-indigo-500 transition-all text-sm">
                             {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={5} className="w-full border-2 border-transparent p-4 text-xs font-medium rounded-2xl bg-white shadow-sm focus:border-indigo-500 outline-none transition-all" placeholder="反馈给客户的指导意见..." />
                          <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-xl shadow-indigo-100">
                             <label className="text-[10px] font-black uppercase mb-2 opacity-60">工单预扣费 (¥)</label>
                             <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full text-4xl font-black bg-transparent border-none p-0 outline-none focus:ring-0 leading-none" />
                          </div>
                       </div>
                    </div>
                    <div className="pt-8 border-t">
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">客户环境</h4>
                       <p className="text-xs font-mono text-gray-500 bg-white p-4 rounded-xl shadow-sm border border-gray-100 whitespace-pre-wrap leading-relaxed">{editingAppeal.loginInfo}</p>
                    </div>
                 </div>

                 {/* AI 深度建模区 (带 Excel 注入) */}
                 <div className="flex-1 p-10 flex flex-col space-y-6 bg-white overflow-hidden">
                    <div className="flex justify-between items-center">
                       <h4 className="font-black text-2xl flex items-center gap-3 text-gray-900 tracking-tighter"><Sparkles className="text-indigo-600"/> 深度 POA 建模引擎</h4>
                       <div className="flex items-center gap-3">
                          <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} id="excel-input" className="hidden" />
                          <label htmlFor="excel-input" className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-2xl font-black text-xs cursor-pointer hover:bg-indigo-100 transition-all">
                             <FileSpreadsheet size={16}/> 注入 Excel 绩效数据
                          </label>
                       </div>
                    </div>

                    {aiStep === 1 ? (
                       <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar pb-10">
                          <div className="grid grid-cols-2 gap-4">
                             <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺全称" className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm font-bold bg-gray-50 outline-none focus:bg-white focus:border-indigo-500 transition-all" />
                             <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="Partner ID" className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm font-bold bg-gray-50 outline-none focus:bg-white focus:border-indigo-500 transition-all" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm font-black bg-gray-50 outline-none focus:bg-white transition-all">
                                {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                             </select>
                             <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="w-full border-2 border-gray-50 p-4 rounded-2xl text-sm font-black bg-gray-50 outline-none focus:bg-white transition-all">
                                {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                          </div>
                          <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border-2 border-gray-50 p-5 rounded-[2rem] text-sm font-bold bg-gray-50 outline-none focus:bg-white transition-all" placeholder="简述根本原因，AI 会以此为基础进行 5-Whys 扩充..." />
                          <div className="space-y-1">
                             <label className="text-[10px] text-gray-400 font-black uppercase ml-1">原始数据建模框 (RAW DATA)</label>
                             <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={6} className="w-full border-none p-5 rounded-[2rem] text-[10px] font-mono bg-gray-900 text-green-400 shadow-inner" placeholder="在此粘贴表格文本或通过上方按钮导入 Excel..." />
                          </div>
                          <button onClick={handleGeneratePOA} disabled={isGenerating} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-100 disabled:bg-gray-400 active:scale-95">
                             {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />} 启动 Gemini 3 深度建模生成
                          </button>
                       </div>
                    ) : (
                       <div className="flex-1 flex flex-col space-y-6 animate-in zoom-in-95 duration-500 min-h-0">
                          <div className="flex-1 bg-gray-50 p-12 border rounded-[3rem] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800 shadow-inner selection:bg-indigo-100">{aiGeneratedText}</div>
                          <div className="flex gap-4 pt-2">
                             <button onClick={() => setAiStep(1)} className="px-10 py-5 border-2 rounded-[1.5rem] font-black text-gray-400 hover:bg-gray-50 transition-all">重新微调建模参数</button>
                             <button onClick={() => {
                                const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `POA_${aiStoreName}_${new Date().toISOString().slice(0,10)}.txt`;
                                a.click();
                             }} className="flex-1 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">
                                <Download size={22}/> 下载申诉文书 (.txt)
                             </button>
                          </div>
                       </div>
                    )}
                 </div>
              </div>

              <div className="p-6 border-t flex justify-end gap-4 bg-gray-50/50">
                 <button onClick={() => setEditingAppeal(null)} className="px-10 py-4 border-2 rounded-2xl font-black text-gray-400 hover:bg-gray-100 transition-all">取消</button>
                 <button onClick={handleSaveAppealTask} disabled={loading} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">
                    {loading ? <Loader2 className="animate-spin" /> : (isStaff ? '提交财务扣费' : '完成处理并保存')}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
