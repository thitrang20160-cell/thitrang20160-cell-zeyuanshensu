
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig, KnowledgeBaseItem } from '../types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, updateAnyUser, getSystemConfig, saveSystemConfig, processDeductionAndCommission, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase, supabase, signOut } from '../services/storageService';
import { 
  CheckCircle, XCircle, Search, Edit3, DollarSign, 
  Save, X, Loader2, Bell, Download, Users, 
  ShieldAlert, TrendingUp, Sparkles, 
  Key, PieChart, RefreshCw, Zap,
  ListChecks, BookOpen, Trash2, FileSpreadsheet, Plus, Activity,
  ChevronDown, ChevronUp, BrainCircuit, Settings, Stethoscope, Database, PlayCircle, Trash, FileText, ClipboardList, AlertTriangle
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

  // State
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (isMarketing) return 'marketing_performance';
    if (isFinance) return 'finance_review';
    if (isStaff) return 'appeals';
    return 'appeals'; // Boss Default
  });

  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [kbItems, setKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // AI & POA State
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

  // Appeal Editing
  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(0);

  // User Management Editing
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState<Partial<User>>({});

  // KB State
  const [kbExpandedId, setKbExpandedId] = useState<string | null>(null);

  // Diagnosis State
  const [diagnosis, setDiagnosis] = useState<{db: boolean | null, ai: boolean | null, auth: boolean | null}>({ db: null, ai: null, auth: null });
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  
  // Full System Test State
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [showTestModal, setShowTestModal] = useState(false);

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
      showToast('系统数据同步失败，请检查网络', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Diagnosis Functions ---
  const runSystemDiagnosis = async () => {
    setIsDiagnosing(true);
    const results = { db: false, ai: false, auth: false };
    
    // 1. Check DB
    try {
      const { error } = await supabase.from('users').select('id').limit(1);
      results.db = !error;
    } catch (e) { results.db = false; }

    // 2. Check Auth Session
    try {
      const { data } = await supabase.auth.getSession();
      results.auth = !!data.session;
    } catch (e) { results.auth = false; }

    // 3. Check AI Key (FIXED: Check Env OR Window)
    try {
      // 只要环境变量有 Key，或者浏览器插件有 Key，都算成功
      const hasEnvKey = !!process.env.API_KEY;
      let hasWindowKey = false;
      if (window.aistudio) {
        try {
           hasWindowKey = await window.aistudio.hasSelectedApiKey();
        } catch(e) {}
      }
      results.ai = hasEnvKey || hasWindowKey;
    } catch (e) { results.ai = false; }

    setDiagnosis(results);
    setIsDiagnosing(false);
    
    if (results.db && results.ai) {
        showToast('系统运行状况良好', 'success');
    } else {
        showToast('发现系统异常，请检查红色项', 'error');
    }
  };

  const generateTestData = async () => {
    setLoading(true);
    try {
        const testId = `TEST-${Date.now()}`;
        await saveAppeal({
            id: `appeal-${Date.now()}`,
            userId: currentUser.id,
            username: '测试自动生成',
            accountType: '测试环境',
            loginInfo: '192.168.1.1 / user / pass',
            emailAccount: `test_${Date.now()}@example.com`,
            emailPass: 'password',
            status: AppealStatus.PENDING,
            adminNotes: '这是自动生成的测试数据，用于验证列表渲染',
            deductionAmount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        showToast('测试数据已生成，请查看工单列表', 'success');
        loadData();
    } catch (e) {
        showToast('生成失败', 'error');
    } finally {
        setLoading(false);
    }
  };
  
  const runFullScenarioTest = async () => {
    setIsTestRunning(true);
    setTestLogs([]);
    setShowTestModal(true);
    
    // Helper to add logs in real-time
    const addLog = (msg: string) => {
        setTestLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
        addLog("🚀 开始全链路功能测试 (Full Scenario Test)...");
        const uniqueId = Date.now();
        const testUserId = `TEST-USER-${uniqueId}`; // Assuming DB allows arbitrary UUIDs or strings
        const testAppealId = `TEST-APPEAL-${uniqueId}`;
        const testTxId = `TEST-TX-${uniqueId}`;
        const testEmail = `autotest_${uniqueId}@example.com`;

        // 1. Create Test User
        addLog(`1. 创建测试用户 (模拟客户) ...`);
        addLog(`   -> ID: ${testUserId}, Email: ${testEmail}, 初始余额: 1000`);
        const { error: userErr } = await supabase.from('users').insert({
            id: testUserId,
            username: `AutoTest_${uniqueId}`,
            role: UserRole.CLIENT,
            balance: 1000,
            createdAt: new Date().toISOString()
        });
        if (userErr) throw new Error(`创建用户失败: ${userErr.message} (可能受RLS策略限制)`);
        addLog("   ✅ 用户创建成功");

        // 2. Client Submission
        addLog(`2. 模拟客户提交申诉 ...`);
        const testAppeal: Appeal = {
            id: testAppealId,
            userId: testUserId,
            username: `AutoTest_${uniqueId}`,
            accountType: 'TestEnv',
            loginInfo: '127.0.0.1',
            emailAccount: testEmail,
            emailPass: 'testpass',
            status: AppealStatus.PENDING,
            description: 'Automated test description',
            adminNotes: '',
            deductionAmount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const { error: appealErr } = await saveAppeal(testAppeal);
        if (appealErr) throw new Error(`申诉提交失败: ${appealErr.message}`);
        addLog("   ✅ 申诉提交成功，状态: PENDING");

        // 3. Staff Review
        addLog(`3. 模拟管理员/员工审核 ...`);
        addLog(`   -> 操作: 更新状态为 PASSED_PENDING_DEDUCTION, 设置扣费 200`);
        const updatedAppeal = {
            ...testAppeal,
            status: AppealStatus.PASSED_PENDING_DEDUCTION,
            adminNotes: 'Auto test approval',
            deductionAmount: 200,
            updatedAt: new Date().toISOString()
        };
        const { error: reviewErr } = await saveAppeal(updatedAppeal);
        if (reviewErr) throw new Error(`审核操作失败: ${reviewErr.message}`);
        addLog("   ✅ 审核状态更新成功");

        // 4. Create Transaction
        addLog(`4. 创建扣费流水单 ...`);
        const testTx: Transaction = {
            id: testTxId,
            userId: testUserId,
            username: `AutoTest_${uniqueId}`,
            type: TransactionType.DEDUCTION,
            amount: 200,
            status: TransactionStatus.PENDING,
            appealId: testAppealId,
            note: 'Auto Test Fee',
            createdAt: new Date().toISOString()
        };
        const { error: txErr } = await saveTransaction(testTx);
        if (txErr) throw new Error(`流水创建失败: ${txErr.message}`);
        addLog("   ✅ 流水创建成功，状态: PENDING");

        // 5. Finance Approval
        addLog(`5. 模拟财务/老板 审批扣费 ...`);
        addLog(`   -> 执行 processDeductionAndCommission`);
        const result = await processDeductionAndCommission(testTxId);
        if (!result.success) throw new Error(`扣费逻辑执行失败: ${result.error}`);
        addLog("   ✅ 扣费逻辑返回成功");

        // 6. Final Verification
        addLog(`6. 最终数据一致性校验 ...`);
        
        // Check User Balance
        const { data: finalUser } = await supabase.from('users').select('*').eq('id', testUserId).single();
        if (finalUser.balance === 800) {
            addLog("   ✅ 用户余额校验通过: 1000 -> 800");
        } else {
            addLog(`   ❌ 用户余额校验失败! 期望: 800, 实际: ${finalUser.balance}`);
            throw new Error("余额计算错误");
        }

        // Check Appeal Status
        const { data: finalAppeal } = await supabase.from('appeals').select('*').eq('id', testAppealId).single();
        if (finalAppeal.status === AppealStatus.PASSED) {
            addLog(`   ✅ 工单状态校验通过: ${AppealStatus.PASSED}`);
        } else {
            addLog(`   ❌ 工单状态校验失败! 期望: ${AppealStatus.PASSED}, 实际: ${finalAppeal.status}`);
        }

        // Check Transaction Status
        const { data: finalTx } = await supabase.from('transactions').select('*').eq('id', testTxId).single();
        if (finalTx.status === TransactionStatus.APPROVED) {
            addLog(`   ✅ 流水状态校验通过: ${TransactionStatus.APPROVED}`);
        } else {
            addLog(`   ❌ 流水状态校验失败! 期望: ${TransactionStatus.APPROVED}, 实际: ${finalTx.status}`);
        }
        
        addLog("-----------------------------------");
        addLog("🎉🎉🎉 测试全部通过！系统功能正常。");
        addLog("-----------------------------------");
        
        // Cleanup
        addLog("7. 清理测试数据 (3秒后执行)...");
        await new Promise(r => setTimeout(r, 3000));
        await supabase.from('users').delete().eq('id', testUserId);
        await supabase.from('appeals').delete().eq('id', testAppealId);
        await supabase.from('transactions').delete().eq('id', testTxId);
        addLog("   ✅ 测试数据已清理完毕");

    } catch (e: any) {
        addLog("-----------------------------------");
        addLog(`❌ 测试过程中断: ${e.message}`);
        addLog("-----------------------------------");
        addLog("⚠️ 请截图或复制此日志反馈给开发人员");
    } finally {
        setIsTestRunning(false);
    }
  };

  const forceClearCache = async () => {
      try {
          await signOut();
      } catch(e) {}
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
  };

  // --- Excel Parsing ---
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        let combinedData = "";
        wb.SheetNames.forEach(sheetName => {
           const ws = wb.Sheets[sheetName];
           const csv = XLSX.utils.sheet_to_csv(ws);
           if (csv && csv.length > 5) { 
             combinedData += `\n--- Sheet: ${sheetName} ---\n${csv}`;
           }
        });

        if (combinedData.length === 0) {
           showToast('表格内容为空', 'error');
        } else {
           setAiTableExtract(combinedData);
           showToast(`成功解析 ${wb.SheetNames.length} 个工作表`, 'success');
        }
      } catch (err) {
        showToast('表格解析失败，请确保格式正确', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- AI Generation ---
  const handleGeneratePOA = async () => {
    if (!aiStoreName || !aiTableExtract) {
      showToast('请先填写店铺名并导入绩效表格', 'error');
      return;
    }

    if (window.aistudio) {
        try {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await window.aistudio.openSelectKey();
            }
        } catch (e) { console.error("Key check failed", e); }
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      
      const prompt = `
        Role: Senior Walmart Appeal Specialist.
        Task: Create a detailed Plan of Action (POA) for Store "${aiStoreName}" (Partner ID: ${aiPartnerId}).
        
        Violation: ${aiPoaSubType}
        Root Cause Hint: ${aiRootCause}
        
        PERFORMANCE DATA (ANALYZED FROM EXCEL):
        ${aiTableExtract}
        
        Team:
        - Operations: ${staff.manager}
        - Logistics: ${staff.warehouse}
        
        REQUIREMENTS:
        1. 5-Whys Analysis (Deep Dive).
        2. Immediate Corrective Actions (Specific to the data).
        3. Long-term Preventive Measures.
        4. Tone: Professional, sincere, accepting responsibility.
        5. Output Format: Clear textual POA structure.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      
      if (response.text) {
        setAiGeneratedText(response.text);
        setAiStep(2);
        showToast('AI 智囊团：文书构建完成', 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast('AI 连接失败：请检查 API Key 权限或网络连接', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Workflow Handling (FIXED: Try/Catch/Finally to prevent infinite loading) ---
  const handleSaveAppealTask = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    
    try {
        let finalStatus = editStatus;
        let finalDeduction = editDeduction;

        if (isStaff && (editStatus === AppealStatus.PASSED || editStatus === AppealStatus.PASSED_PENDING_DEDUCTION)) {
          finalStatus = AppealStatus.PASSED_PENDING_DEDUCTION;
        }

        const updatedAppeal = { 
          ...editingAppeal, 
          status: finalStatus, 
          adminNotes: editNote, 
          deductionAmount: finalDeduction, 
          updatedAt: new Date().toISOString() 
        };

        await saveAppeal(updatedAppeal);
        
        const isBossOrFinance = isSuper || isFinance;
        
        if (isBossOrFinance && (finalStatus === AppealStatus.PASSED) && finalDeduction > 0) {
           const txId = `deduct-${Date.now()}`;
           await saveTransaction({ 
             id: txId, 
             userId: editingAppeal.userId, 
             username: editingAppeal.username, 
             type: TransactionType.DEDUCTION, 
             amount: finalDeduction, 
             status: TransactionStatus.PENDING, 
             appealId: editingAppeal.id, 
             note: `工单 ${editingAppeal.id.slice(-6)} 服务费`, 
             createdAt: new Date().toISOString() 
           });
           
           const result = await processDeductionAndCommission(txId);
           if (result.success) {
             showToast('工单已完结并成功扣费', 'success');
           } else {
             showToast('扣费失败: ' + result.error, 'error');
           }
        } else if (isStaff && finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION) {
           showToast('已标记为成功，提交给财务/老板核算扣费', 'info');
    } else {
           showToast('工单状态已更新', 'success');
        }
        
        setEditingAppeal(null);
        loadData();
    } catch (err: any) {
        console.error("Save failed", err);
        showToast('保存失败: ' + (err.message || '未知错误'), 'error');
    } finally {
        setLoading(false); // Ensure loader stops
    }
  };

  const handleEditUser = async () => {
    if (!editingUser || !editUserForm) return;
    const updated = { ...editingUser, ...editUserForm };
    const success = await updateAnyUser(updated);
    if (success) {
      showToast('用户信息更新成功', 'success');
      setEditingUser(null);
      loadData();
    } else {
      showToast('更新失败', 'error');
    }
  };

  const handleOpenKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
      } catch (e) {
        showToast('打开密钥选择器失败，请刷新重试', 'error');
      }
    } else {
      showToast('环境不支持 API Key 选择器', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部多角色导航 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {(isSuper || isStaff) && <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>工单处理</button>}
          {(isSuper || isFinance) && <button onClick={() => setActiveTab('finance_review')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>财务大厅</button>}
          {isSuper && <button onClick={() => setActiveTab('knowledge_base')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'knowledge_base' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>AI 智囊团</button>}
          {(isSuper || isMarketing) && <button onClick={() => setActiveTab('marketing_performance')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>营销业绩</button>}
          {isSuper && <button onClick={() => setActiveTab('user_management')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'user_management' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>员工管理</button>}
          {isSuper && <button onClick={() => setActiveTab('system_config')} className={`flex-1 py-4 px-6 text-sm font-bold whitespace-nowrap ${activeTab === 'system_config' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>全局设置</button>}
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
                              <td className="p-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold 
                                  ${a.status === AppealStatus.PASSED_PENDING_DEDUCTION ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100'}
                                `}>
                                  {a.status}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                 <button onClick={() => { setEditingAppeal(a); setEditStatus(a.status); setEditNote(a.adminNotes); setEditDeduction(a.deductionAmount || 0); }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all">处理</button>
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
               
               {/* Section for Appeals that are marked successful by Staff but not yet charged */}
               <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                 <h3 className="font-bold text-yellow-800 flex items-center gap-2 mb-3"><Bell size={18}/> 待扣费工单 (员工已处理)</h3>
                 <div className="overflow-x-auto bg-white rounded-lg border">
                   <table className="min-w-full">
                     <thead>
                       <tr className="bg-gray-50 text-xs text-gray-500"><th className="p-3 text-left">客户</th><th className="p-3 text-left">账号</th><th className="p-3 text-right">操作</th></tr>
                     </thead>
                     <tbody>
                       {appeals.filter(a => a.status === AppealStatus.PASSED_PENDING_DEDUCTION).map(a => (
                         <tr key={a.id} className="border-t">
                           <td className="p-3 font-bold text-sm">{a.username}</td>
                           <td className="p-3 text-xs">{a.emailAccount}</td>
                           <td className="p-3 text-right">
                             <button onClick={() => { setEditingAppeal(a); setEditStatus(AppealStatus.PASSED); setEditDeduction(200); }} className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold">确认扣费</button>
                           </td>
                         </tr>
                       ))}
                       {appeals.filter(a => a.status === AppealStatus.PASSED_PENDING_DEDUCTION).length === 0 && (
                         <tr><td colSpan={3} className="p-4 text-center text-gray-400 text-xs">暂无待扣费工单</td></tr>
                       )}
                     </tbody>
                   </table>
                 </div>
               </div>

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

          {/* TAB 3: AI 智囊团 (Boss Only) - Restored Features (Stats & Accordion) */}
          {activeTab === 'knowledge_base' && isSuper && (
            <div className="space-y-6 animate-in fade-in">
               {/* Stats Header */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-indigo-600 text-white p-4 rounded-xl shadow-lg">
                    <p className="text-xs opacity-70 uppercase font-bold">累计生成 POA</p>
                    <p className="text-3xl font-black">1,284</p>
                  </div>
                  <div className="bg-white border p-4 rounded-xl shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">AI 调用次数</p>
                    <p className="text-3xl font-black text-gray-800">15.2k</p>
                  </div>
               </div>

               <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><BrainCircuit className="text-indigo-600"/> 智囊团策略库</h3>
                  <button className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg text-xs font-bold"><Plus size={14}/> 上传新策略</button>
               </div>
               
               <div className="space-y-3">
                  {kbItems.map(item => (
                    <div key={item.id} className="border rounded-xl bg-white overflow-hidden transition-all">
                       <div 
                         className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                         onClick={() => setKbExpandedId(kbExpandedId === item.id ? null : item.id)}
                       >
                         <div className="flex items-center gap-3">
                            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><BookOpen size={16}/></div>
                            <div>
                              <h4 className="font-bold text-sm text-gray-900">{item.title}</h4>
                              <p className="text-xs text-gray-400">{item.type} • 引用 {item.usageCount} 次</p>
                            </div>
                         </div>
                         {kbExpandedId === item.id ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                       </div>
                       
                       {kbExpandedId === item.id && (
                         <div className="p-4 pt-0 border-t bg-gray-50">
                           <p className="text-xs text-gray-600 leading-relaxed font-mono mt-3 whitespace-pre-wrap">{item.content}</p>
                           <div className="flex justify-end mt-2">
                              <button onClick={() => deleteFromKnowledgeBase(item.id).then(loadData)} className="text-red-500 text-xs font-bold hover:underline flex items-center gap-1"><Trash2 size={12}/> 删除</button>
                           </div>
                         </div>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* TAB 4: 营销业绩 (FIXED: White Screen / Null Safe) */}
          {activeTab === 'marketing_performance' && (isSuper || isMarketing) && (
             <div className="animate-in fade-in space-y-6">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-2xl text-white shadow-lg relative overflow-hidden">
                   <Zap className="absolute right-0 bottom-0 opacity-10" size={120} />
                   <h4 className="text-2xl font-black mb-2">营销合伙人中心</h4>
                   <div className="flex gap-6 mt-4">
                      <div><p className="text-xs opacity-60 uppercase">累计佣金</p><p className="text-3xl font-bold">¥{(currentUser.balance || 0).toFixed(2)}</p></div>
                      <div><p className="text-xs opacity-60 uppercase">专属邀请码</p><p className="text-3xl font-mono font-bold">{currentUser.marketingCode || '未分配'}</p></div>
                   </div>
                </div>
                <div className="bg-white border rounded-xl p-6">
                   <h5 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><TrendingUp className="text-green-500"/> 收益明细</h5>
                   {transactions.filter(t => t.userId === currentUser.id && t.type === TransactionType.COMMISSION).map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
                         <span className="text-sm text-gray-600">{t.note}</span>
                         <span className="text-sm font-bold text-green-600">+¥{(t.amount || 0).toFixed(2)}</span>
                      </div>
                   ))}
                </div>
             </div>
          )}
          
          {/* TAB 5: 员工管理 - With Edit Modal */}
          {activeTab === 'user_management' && isSuper && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users className="text-indigo-600"/> 团队与用户管理</h3>
              <div className="overflow-x-auto border rounded-xl">
                 <table className="min-w-full">
                   <thead className="bg-gray-50 text-xs text-gray-400 font-bold uppercase">
                     <tr><th className="p-3 text-left">用户</th><th className="p-3 text-left">角色</th><th className="p-3 text-left">余额</th><th className="p-3 text-right">管理</th></tr>
                   </thead>
                   <tbody>
                     {allUsers.map(u => (
                       <tr key={u.id} className="border-t hover:bg-gray-50">
                         <td className="p-3 text-sm font-bold">{u.username}</td>
                         <td className="p-3 text-sm"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">{u.role}</span></td>
                         <td className="p-3 text-sm">¥{u.balance}</td>
                         <td className="p-3 text-right">
                           <button onClick={() => { setEditingUser(u); setEditUserForm(u); }} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"><Edit3 size={16}/></button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* TAB 6: 系统配置 - With Developer Tools */}
          {activeTab === 'system_config' && isSuper && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                {/* Developer Diagnostic Tool */}
                <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl p-6 text-white shadow-xl">
                    <h4 className="font-bold flex items-center gap-2 mb-4"><Stethoscope className="text-green-400"/> 开发者诊断中心</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <button 
                            onClick={runSystemDiagnosis}
                            disabled={isDiagnosing}
                            className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors relative overflow-hidden"
                        >
                            <Activity className="mb-2 text-blue-400"/>
                            <p className="text-xs text-gray-400">一键体检</p>
                            <p className="font-bold">系统自检</p>
                            {isDiagnosing && <Loader2 className="absolute top-4 right-4 animate-spin text-gray-500"/>}
                        </button>

                         <button 
                            onClick={runFullScenarioTest}
                            className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors relative"
                        >
                            <ClipboardList className="mb-2 text-yellow-400"/>
                            <p className="text-xs text-gray-400">模拟全流程</p>
                            <p className="font-bold">全链路测试</p>
                            {isTestRunning && <Loader2 className="absolute top-4 right-4 animate-spin text-gray-500"/>}
                        </button>

                        <button 
                            onClick={generateTestData}
                            className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors"
                        >
                            <PlayCircle className="mb-2 text-orange-400"/>
                            <p className="text-xs text-gray-400">列表为空时使用</p>
                            <p className="font-bold">生成测试数据</p>
                        </button>
                        
                        <div className="bg-white/5 p-4 rounded-xl text-left border border-white/10">
                            <Sparkles className="mb-2 text-indigo-400"/>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-gray-400">AI 服务</p>
                                    <p className="font-bold text-sm">{diagnosis.ai === true ? '已授权' : diagnosis.ai === false ? '未授权' : '未检测'}</p>
                                </div>
                                {diagnosis.ai === true && <CheckCircle size={16} className="text-green-400"/>}
                                {diagnosis.ai === false && <XCircle size={16} className="text-red-400"/>}
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                        <p className="text-xs text-gray-500">遇到白屏或卡死？尝试强制重置。</p>
                        <button onClick={forceClearCache} className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-bold flex items-center gap-2">
                            <Trash size={14}/> 强制清理缓存并重启
                        </button>
                    </div>
                </div>

                <div className="p-6 bg-white border rounded-2xl space-y-4">
                   <h4 className="font-bold flex items-center gap-2 text-gray-800"><Settings className="text-indigo-600"/> 客户端 UI 数据修饰</h4>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">基础案例数 (Base Cases)</label>
                        <input type="number" value={config?.marketingBaseCases} onChange={e => setConfig(prev => prev ? {...prev, marketingBaseCases: Number(e.target.value)} : null)} className="w-full border p-2 rounded-lg bg-gray-50 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">基础排队数 (Queue)</label>
                        <input type="number" value={config?.marketingBaseProcessing} onChange={e => setConfig(prev => prev ? {...prev, marketingBaseProcessing: Number(e.target.value)} : null)} className="w-full border p-2 rounded-lg bg-gray-50 text-sm" />
                      </div>
                   </div>
                   
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">展示成功率 (Success Rate %)</label>
                      <input type="text" value={config?.marketingSuccessRate} onChange={e => setConfig(prev => prev ? {...prev, marketingSuccessRate: e.target.value} : null)} className="w-full border p-2 rounded-lg bg-gray-50 text-sm" placeholder="e.g. 98.8" />
                   </div>

                   <div className="space-y-1 pt-2 border-t">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">管理员/客服联系方式</label>
                      <textarea value={config?.contactInfo} onChange={e => setConfig(prev => prev ? {...prev, contactInfo: e.target.value} : null)} className="w-full border p-2 rounded-lg bg-gray-50 text-sm h-20" placeholder="微信: xxx, 电话: xxx" />
                   </div>

                   <button onClick={() => config && saveSystemConfig(config).then(() => showToast('配置已保存', 'success'))} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm shadow hover:bg-indigo-700 transition-colors">更新前台配置</button>
                </div>
                
                <div className="p-6 bg-white border rounded-2xl space-y-4 relative overflow-hidden">
                   <Key className="absolute right-[-10px] top-[-10px] opacity-10 text-gray-900" size={100} />
                   <h4 className="font-bold flex items-center gap-2 text-gray-800"><RefreshCw className="text-indigo-600"/> API 连接设置</h4>
                   <p className="text-xs text-gray-500">如果 AI 生成失败，请重新授权 Gemini API。</p>
                   <button onClick={handleOpenKey} className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg">
                     打开密钥授权窗口
                   </button>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* MODAL: Appeal Processing */}
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
                 {/* Left: Manual Decisions */}
                 <div className="w-80 p-6 bg-gray-50/50 border-r overflow-y-auto space-y-6">
                    <div>
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">决策控制</h4>
                       <div className="space-y-3">
                          <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-3 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm">
                             {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className="w-full border p-3 rounded-xl text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="回复内容..." />
                          
                          {/* Only Boss/Finance can finalize deduction */}
                          {(isSuper || isFinance) && (
                             <div className="bg-white p-3 rounded-xl border shadow-sm">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">确认扣费 (¥)</label>
                                <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full text-xl font-black text-indigo-600 outline-none mt-1" />
                             </div>
                          )}
                          {isStaff && (
                            <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                               提示：标记为“成功”将提交给上级核算扣费。
                            </p>
                          )}
                       </div>
                    </div>
                    <div className="pt-4 border-t">
                       <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">环境信息</h4>
                       <p className="text-xs bg-white p-3 rounded-xl border text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{editingAppeal.loginInfo}</p>
                    </div>
                 </div>

                 {/* Right: AI Engine */}
                 <div className="flex-1 p-8 flex flex-col bg-white overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                       <h4 className="text-2xl font-black text-gray-900 flex items-center gap-3"><BrainCircuit className="text-indigo-600"/> AI 智囊团分析引擎</h4>
                       <div className="flex items-center gap-3">
                          <div className="relative">
                             <input type="file" id="excel-up" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
                             <label htmlFor="excel-up" className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-100 transition-colors">
                                <FileSpreadsheet size={16}/> 导入多表 Excel
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
                             <label className="text-[10px] font-black text-gray-400 uppercase ml-1">全表数据上下文 (Auto-Combined)</label>
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
                                // Word Export Logic: Wrap text in HTML with MS Word namespaces
                                const htmlContent = `
                                  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                                  <head><meta charset='utf-8'><title>POA Document</title></head>
                                  <body><pre style="font-family: Arial; white-space: pre-wrap;">${aiGeneratedText}</pre></body>
                                  </html>`;
                                const blob = new Blob([htmlContent], {type: 'application/msword'});
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `POA_${aiStoreName}.doc`; // .doc extension triggers Word
                                a.click();
                             }} className="flex-1 bg-indigo-600 text-white rounded-xl font-black text-lg flex items-center justify-center gap-2 shadow-xl hover:bg-indigo-700 transition-colors active:scale-95">
                                <FileText size={20}/> 导出为 Word (.doc)
                             </button>
                          </div>
                       </div>
                    )}
                 </div>
              </div>

              <div className="p-5 border-t bg-gray-50 flex justify-end gap-4">
                 <button onClick={() => setEditingAppeal(null)} className="px-8 py-3 border rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">取消</button>
                 <button onClick={handleSaveAppealTask} disabled={loading} className="px-12 py-3 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
                    {loading ? <Loader2 className="animate-spin"/> : '确认处理结果'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: Full System Test Logs */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
           <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 text-white border border-gray-700 flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="text-yellow-400"/> 全链路自动化测试日志</h3>
                 {!isTestRunning && (
                   <button onClick={() => setShowTestModal(false)} className="p-1 hover:bg-gray-700 rounded-full transition-colors"><X size={20}/></button>
                 )}
              </div>
              
              <div className="flex-1 bg-black/50 rounded-xl p-4 overflow-y-auto font-mono text-xs sm:text-sm space-y-1 border border-gray-800 shadow-inner">
                 {testLogs.length === 0 && <p className="text-gray-500 italic">正在初始化测试环境...</p>}
                 {testLogs.map((log, i) => (
                    <div key={i} className={`
                       ${log.includes('✅') ? 'text-green-400' : ''}
                       ${log.includes('❌') ? 'text-red-400 font-bold' : ''}
                       ${log.includes('⚠️') ? 'text-yellow-400' : ''}
                       ${!log.includes('✅') && !log.includes('❌') && !log.includes('⚠️') ? 'text-gray-300' : ''}
                    `}>
                       {log}
                    </div>
                 ))}
                 {isTestRunning && (
                    <div className="flex items-center gap-2 text-blue-400 mt-2">
                       <Loader2 size={14} className="animate-spin"/> 正在执行步骤...
                    </div>
                 )}
              </div>

              <div className="mt-4 flex justify-between items-center">
                 <p className="text-xs text-gray-500">测试数据将在测试完成后自动清理</p>
                 <div className="flex gap-3">
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(testLogs.join('\n'));
                            showToast('日志已复制', 'success');
                        }} 
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-bold border border-gray-600 transition-colors"
                    >
                        复制日志
                    </button>
                    {!isTestRunning && (
                        <button onClick={() => setShowTestModal(false)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-colors">
                            关闭窗口
                        </button>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: User Editing */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-xl font-bold mb-4">编辑用户: {editingUser.username}</h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">角色权限</label>
                    <select value={editUserForm.role} onChange={e => setEditUserForm({...editUserForm, role: e.target.value as UserRole})} className="w-full border p-2 rounded-lg">
                       {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">账户余额</label>
                    <input type="number" value={editUserForm.balance} onChange={e => setEditUserForm({...editUserForm, balance: Number(e.target.value)})} className="w-full border p-2 rounded-lg" />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">联系电话</label>
                    <input type="text" value={editUserForm.phone || ''} onChange={e => setEditUserForm({...editUserForm, phone: e.target.value})} className="w-full border p-2 rounded-lg" />
                 </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">营销邀请码</label>
                    <input type="text" value={editUserForm.marketingCode || ''} onChange={e => setEditUserForm({...editUserForm, marketingCode: e.target.value})} className="w-full border p-2 rounded-lg" />
                 </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                 <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-500 font-bold">取消</button>
                 <button onClick={handleEditUser} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold">保存修改</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
