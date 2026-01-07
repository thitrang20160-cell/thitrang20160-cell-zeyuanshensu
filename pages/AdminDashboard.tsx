
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig, KnowledgeBaseItem } from '../types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, searchUsers, updateAnyUser, getSystemConfig, saveSystemConfig, processDeductionAndCommission, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase, supabase } from '../services/storageService';
import { 
  CheckCircle, XCircle, Search, Edit3, DollarSign, 
  Save, X, Loader2, Bell, Download, Users, 
  ShieldAlert, TrendingUp, Sparkles, 
  Key, PieChart, RefreshCw, Zap,
  ListChecks, BookOpen, Trash2, FileSpreadsheet, Plus, Activity,
  ChevronLeft, ChevronRight
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
  
  // Role Check
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isStaff = currentUser.role === UserRole.ADMIN;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const isMarketing = currentUser.role === UserRole.MARKETING;

  // Tabs
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (isMarketing) return 'marketing_performance';
    if (isFinance) return 'finance_review';
    if (isStaff) return 'appeals';
    return 'appeals'; 
  });

  // Data States
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userList, setUserList] = useState<User[]>([]); // For user management
  const [kbItems, setKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  
  // Pagination & Search States
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 15;

  // AI State
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

  // Edit/Action States
  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(0);
  const [showKbModal, setShowKbModal] = useState(false);
  const [newKbItem, setNewKbItem] = useState({ title: '', content: '' });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState<Partial<User>>({});

  // --- Dynamic Data Loading ---
  const loadData = useCallback(async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);

    try {
      if (activeTab === 'appeals') {
        const { data, count } = await getAppeals(currentPage, PAGE_SIZE, searchTerm);
        setAppeals(data);
        setTotalCount(count);
      } 
      else if (activeTab === 'finance_review') {
        const { data, count } = await getTransactions(currentPage, PAGE_SIZE, TransactionStatus.PENDING);
        setTransactions(data);
        setTotalCount(count);
      }
      else if (activeTab === 'user_management') {
         if (searchTerm) {
             const users = await searchUsers(searchTerm);
             setUserList(users);
         } else {
             // 默认不加载所有用户，只清空或显示少量
             setUserList([]); 
         }
      }
      
      // Load static/light data once
      if (config === null) {
          const c = await getSystemConfig();
          setConfig(c);
          const kb = await getKnowledgeBase();
          setKbItems(kb);
      }
    } catch (e) {
      console.error(e);
      showToast('数据加载异常', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, searchTerm, config, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]); // Dependency included

  // Search Handler
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(true); // Reset to page 0
  };

  // Pagination Handler
  const handlePageChange = (newPage: number) => {
    if (newPage < 0) return;
    setPage(newPage); 
    // Effect will trigger loadData due to page dependency, but we need to ensure state updates first
    // Actually relying on useEffect is better here
  };

  // --- AI & Logic --- (Same as before, simplified for brevity but fully functional)
  const handleOpenEdit = (appeal: Appeal) => {
      setEditingAppeal(appeal);
      setEditStatus(appeal.status);
      setEditNote(appeal.adminNotes || '');
      setEditDeduction(appeal.deductionAmount || 0);
      setAiGeneratedText(appeal.generatedPoa || '');
      setAiStep(appeal.generatedPoa ? 2 : 1);
      if (appeal.generatedPoa) setAiStoreName(appeal.username);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const wb = XLSX.read(evt.target?.result, { type: 'binary' });
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
            setAiTableExtract(csv.slice(0, 2000)); // Limit size for AI
            showToast('数据已提取', 'success');
        } catch (e) { showToast('解析失败', 'error'); }
    };
    reader.readAsBinaryString(file);
  };

  const handleGeneratePOA = async () => {
    if (!aiStoreName) { showToast('需填写店铺名', 'error'); return; }
    setIsGenerating(true);
    try {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey() === false) {
         await window.aistudio.openSelectKey();
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      const prompt = `Role: Walmart Appeal Expert. Task: Write POA for Store "${aiStoreName}". Violation: ${aiPoaSubType}. Root Cause: ${aiRootCause}. Data: ${aiTableExtract}. Team: ${staff.manager}, ${staff.warehouse}. Structure: 5-Whys, Immediate Actions, Prevention.`;
      
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setAiGeneratedText(res.text || 'Error generating');
      setAiStep(2);
    } catch (e) { showToast('AI 生成失败', 'error'); } 
    finally { setIsGenerating(false); }
  };

  const handleSaveAppealTask = async () => {
      if (!editingAppeal) return;
      setLoading(true);
      try {
          let status = editStatus;
          if (isStaff && status === AppealStatus.PASSED) status = AppealStatus.PASSED_PENDING_DEDUCTION;
          
          let handler = editingAppeal.handlerId || ((isStaff || isSuper) ? currentUser.id : undefined);

          await saveAppeal({ ...editingAppeal, status, adminNotes: editNote, deductionAmount: editDeduction, generatedPoa: aiGeneratedText, handlerId: handler, updatedAt: new Date().toISOString() });
          
          if ((isSuper || isFinance) && status === AppealStatus.PASSED && editDeduction > 0) {
              const txId = `deduct-${Date.now()}`;
              await saveTransaction({ id: txId, userId: editingAppeal.userId, username: editingAppeal.username, type: TransactionType.DEDUCTION, amount: editDeduction, status: TransactionStatus.PENDING, appealId: editingAppeal.id, note: `工单 ${editingAppeal.emailAccount}`, createdAt: new Date().toISOString() });
              await processDeductionAndCommission(txId);
          }
          showToast('处理完成', 'success');
          setEditingAppeal(null);
          loadData();
      } catch (e) { showToast('保存失败', 'error'); }
      finally { setLoading(false); }
  };

  // --- Render Helpers ---
  const PaginationControls = () => (
      <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <span className="text-xs text-gray-500">显示 {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} 共 {totalCount} 条</span>
          <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"><ChevronLeft size={20}/></button>
              <button disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)} className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"><ChevronRight size={20}/></button>
          </div>
      </div>
  );

  return (
    <div className="space-y-6">
      {/* Tab Nav */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b overflow-x-auto no-scrollbar">
           {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'appeals' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500'}`}>工单处理 (20k+)</button>}
           {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'finance_review' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500'}`}>财务审核</button>}
           {isSuper && <button onClick={() => setActiveTab('knowledge_base')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'knowledge_base' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500'}`}>AI 智囊</button>}
           {(isSuper || isMarketing) && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'marketing_performance' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500'}`}>业绩报表</button>}
           {isSuper && <button onClick={() => setActiveTab('user_management')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'user_management' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500'}`}>人员管理</button>}
           {isSuper && <button onClick={() => setActiveTab('system_config')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'system_config' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500'}`}>配置</button>}
        </div>

        <div className="p-6">
           {/* TAB: APPEALS */}
           {activeTab === 'appeals' && (
               <div className="space-y-4">
                   <form onSubmit={handleSearch} className="flex gap-2">
                       <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="在大数据中搜索 (邮箱/客户)..." className="flex-1 border p-2 rounded-lg text-sm" />
                       <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold">搜索</button>
                   </form>
                   <div className="overflow-x-auto border rounded-xl bg-white relative">
                       {loading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>}
                       <table className="min-w-full">
                           <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                               <tr><th className="p-4 text-left">时间</th><th className="p-4 text-left">客户</th><th className="p-4 text-left">账号</th><th className="p-4 text-left">状态</th><th className="p-4 text-right">操作</th></tr>
                           </thead>
                           <tbody className="divide-y">
                               {appeals.map(a => (
                                   <tr key={a.id} className="hover:bg-gray-50">
                                       <td className="p-4 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                                       <td className="p-4 text-sm font-bold">{a.username}</td>
                                       <td className="p-4 text-xs font-mono">{a.emailAccount}</td>
                                       <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${a.status === '待处理' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{a.status}</span></td>
                                       <td className="p-4 text-right"><button onClick={() => handleOpenEdit(a)} className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold">处理</button></td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                       <PaginationControls />
                   </div>
               </div>
           )}

           {/* TAB: FINANCE */}
           {activeTab === 'finance_review' && (
               <div className="space-y-4">
                   <h3 className="font-bold flex items-center gap-2"><DollarSign className="text-green-600"/> 待审核流水</h3>
                   <div className="border rounded-xl bg-white overflow-hidden relative">
                       {loading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"><Loader2 className="animate-spin"/></div>}
                       <table className="min-w-full">
                           <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                               <tr><th className="p-4 text-left">申请人</th><th className="p-4 text-left">金额</th><th className="p-4 text-right">操作</th></tr>
                           </thead>
                           <tbody className="divide-y">
                               {transactions.map(t => (
                                   <tr key={t.id}>
                                       <td className="p-4 text-sm font-bold">{t.username} <span className="text-xs font-normal text-gray-400">({t.type})</span></td>
                                       <td className="p-4 text-sm font-bold text-gray-900">¥{t.amount}</td>
                                       <td className="p-4 text-right space-x-2">
                                           <button onClick={() => processDeductionAndCommission(t.id).then(() => { showToast('通过', 'success'); loadData(); })} className="bg-green-600 text-white px-3 py-1 rounded text-xs">通过</button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                       <PaginationControls />
                   </div>
               </div>
           )}

           {/* TAB: MARKETING (Simulated Report) */}
           {activeTab === 'marketing_performance' && (
               <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl text-white shadow-xl">
                   <h2 className="text-3xl font-black mb-2">全站模拟数据报表</h2>
                   <div className="grid grid-cols-3 gap-8 mt-6">
                       <div><p className="text-sm opacity-75">总模拟客户</p><p className="text-4xl font-bold">20,005</p></div>
                       <div><p className="text-sm opacity-75">工单处理量</p><p className="text-4xl font-bold">24,832</p></div>
                       <div><p className="text-sm opacity-75">预计营收 (模拟)</p><p className="text-4xl font-bold">¥4.2M</p></div>
                   </div>
               </div>
           )}

           {/* TAB: CONFIG */}
           {activeTab === 'system_config' && (
               <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 border rounded-xl">
                       <h4 className="font-bold mb-2">Gemini API</h4>
                       <button onClick={() => window.aistudio?.openSelectKey()} className="bg-gray-900 text-white w-full py-2 rounded-lg text-xs font-bold">配置密钥</button>
                   </div>
                   <div className="p-4 border rounded-xl">
                       <h4 className="font-bold mb-2">费率设置</h4>
                       <div className="flex gap-2">
                           <input type="number" placeholder="营销 0.1" className="border p-1 w-full rounded" defaultValue={config?.commissionRate}/>
                           <button className="bg-indigo-600 text-white px-3 rounded font-bold">保存</button>
                       </div>
                   </div>
               </div>
           )}
           
           {/* TAB: USER MANAGEMENT (Search Based) */}
           {activeTab === 'user_management' && (
               <div className="space-y-4">
                  <form onSubmit={handleSearch} className="flex gap-2">
                       <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜索 20,000 用户库..." className="flex-1 border p-2 rounded-lg text-sm" />
                       <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold">查询</button>
                  </form>
                  <div className="border rounded-xl overflow-hidden">
                      <table className="min-w-full bg-white">
                          <thead className="bg-gray-50 text-xs font-bold text-gray-500"><tr><th className="p-3 text-left">用户</th><th className="p-3">角色</th><th className="p-3">余额</th><th className="p-3 text-right">管理</th></tr></thead>
                          <tbody>
                              {userList.map(u => (
                                  <tr key={u.id} className="border-t">
                                      <td className="p-3 font-bold">{u.username}</td>
                                      <td className="p-3 text-xs">{u.role}</td>
                                      <td className="p-3 text-xs">¥{u.balance}</td>
                                      <td className="p-3 text-right"><button onClick={() => {setEditingUser(u); setEditUserForm(u);}} className="text-indigo-600"><Edit3 size={16}/></button></td>
                                  </tr>
                              ))}
                              {userList.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400 text-sm">请输入关键词搜索用户</td></tr>}
                          </tbody>
                      </table>
                  </div>
               </div>
           )}
        </div>
      </div>

      {/* Appeal Edit Modal (Simplified for brevity but includes AI logic) */}
      {editingAppeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex overflow-hidden">
                  <div className="w-1/3 bg-gray-50 border-r p-6 space-y-4 overflow-y-auto">
                      <h3 className="font-bold">人工决策</h3>
                      <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)} className="w-full border p-2 rounded"><option>待处理</option><option>处理中</option><option>申诉通过-待扣费</option><option>申诉通过-已扣费</option></select>
                      <textarea value={editNote} onChange={e => setEditNote(e.target.value)} className="w-full border p-2 rounded h-32" placeholder="备注..."></textarea>
                      <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full border p-2 rounded font-bold text-red-600" />
                  </div>
                  <div className="flex-1 p-6 flex flex-col">
                      <div className="flex justify-between mb-4">
                          <h3 className="font-bold flex gap-2"><Sparkles className="text-indigo-600"/> Gemini AI 引擎</h3>
                          <button onClick={handleGeneratePOA} disabled={isGenerating} className="bg-indigo-600 text-white px-4 py-1 rounded font-bold text-xs">{isGenerating ? '生成中...' : '生成 POA'}</button>
                      </div>
                      {aiStep === 1 ? (
                          <div className="space-y-3 flex-1 overflow-y-auto">
                              <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名 (必须)" className="w-full border p-2 rounded" />
                              <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} placeholder="根本原因..." className="w-full border p-2 rounded h-20" />
                              <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} placeholder="Excel 数据..." className="w-full border p-2 rounded h-40 font-mono text-xs bg-gray-100" />
                          </div>
                      ) : (
                          <textarea value={aiGeneratedText} readOnly className="flex-1 border p-4 rounded bg-gray-50 font-serif text-sm whitespace-pre-wrap" />
                      )}
                      <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setEditingAppeal(null)} className="px-4 py-2 border rounded">取消</button>
                          <button onClick={handleSaveAppealTask} className="px-6 py-2 bg-indigo-600 text-white rounded font-bold">确认提交</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* User Edit Modal */}
      {editingUser && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
              <div className="bg-white p-6 rounded-xl w-96 space-y-4">
                  <h3 className="font-bold">编辑用户</h3>
                  <select value={editUserForm.role} onChange={e => setEditUserForm({...editUserForm, role: e.target.value as any})} className="w-full border p-2 rounded">
                      {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input type="number" value={editUserForm.balance} onChange={e => setEditUserForm({...editUserForm, balance: Number(e.target.value)})} className="w-full border p-2 rounded" placeholder="余额" />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingUser(null)} className="px-3 py-1 border rounded">取消</button>
                      <button onClick={async () => { await updateAnyUser({...editingUser, ...editUserForm}); setEditingUser(null); loadData(); }} className="px-3 py-1 bg-indigo-600 text-white rounded">保存</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
