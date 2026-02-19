import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  History, 
  Settings, 
  Sparkles, 
  ShieldAlert, 
  Save, 
  Copy, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Download,
  BrainCircuit,
  UploadCloud,
  FileSpreadsheet,
  Lightbulb,
  Truck,
  Scale,
  Library,
  Plus,
  Trash2,
  BookOpen,
  Upload,
  Loader2,
  Wand2,
  RefreshCw,
  Database,
  Briefcase,
  Search,
  UserCircle,
  Hash,
  Factory,
  LogOut,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Users,
  Edit2,
  UserPlus,
  KeyRound,
  Cpu,
  Gavel,
  Send,
  Eye,
  Server,
  Cloud,
  CloudLightning,
  Wifi,
  WifiOff,
  AlertTriangle,
  Crown
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

import { 
  loadCases, saveCases, loadSettings, saveSettings, loadReferences, saveReferences,
  loginUser, registerUser, getCurrentSession, setCurrentSession,
  getAllUsers, deleteUser, updateUser
} from './services/storageService';
import { generatePOA, generateCNExplanation, autoFixPOA } from './services/geminiService';
import { CloudService } from './services/cloudService';
import { parseFile } from './services/fileService';
import { submitPOAToWalmart } from './services/walmartService';
import { CaseData, GlobalSettings, RiskAnalysis, ViolationType, SupplyChainType, ReferenceCase, User as UserType, AIProvider, UserRole } from './types';
import { RiskBadge } from './components/RiskBadge';

const TABS = {
  DASHBOARD: 'dashboard',
  GENERATOR: 'generator',
  HISTORY: 'history',
  LIBRARY: 'library',
  SETTINGS: 'settings'
};

// Helper: Calculate similarity between two texts (Jaccard Index approximation)
const calculateSimilarity = (textA: string, textB: string): number => {
  if (!textA || !textB) return 0;
  const setA = new Set(textA.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const setB = new Set(textB.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
};

// Helper: Strip Markdown for clean copying
const stripMarkdown = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1')     // Remove italic
    .replace(/^#+\s/gm, '')          // Remove headers
    .replace(/`/g, '')               // Remove code blocks
    .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove links
};

function App() {
  // Auth State
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // App Data State
  const [activeTab, setActiveTab] = useState(TABS.DASHBOARD);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [references, setReferences] = useState<ReferenceCase[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>({ 
    selectedProvider: 'gemini',
    apiKey: '', 
    deepseekKey: '',
    walmartClientId: '',
    walmartClientSecret: '',
    enableSimulationMode: true,
    supabaseUrl: '',
    supabaseKey: '',
    strategyGeneral: '', 
    strategyLogistics: '', 
    strategyIP: '' 
  });
  
  // Admin User Management State
  const [userList, setUserList] = useState<UserType[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null); // Track which user is being edited
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', role: 'client' as UserRole, companyName: '' });
  const [editUserForm, setEditUserForm] = useState({ role: 'client' as UserRole, companyName: '' });

  // Change Password State
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });

  // Admin Review State
  const [reviewCase, setReviewCase] = useState<CaseData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generator State
  const [formData, setFormData] = useState<Partial<CaseData>>({
    storeName: '',
    companyName: '', 
    caseId: '',      
    productCategory: '',
    supplyChain: 'Private Label',
    violationType: 'Performance',
    suspensionEmail: '',
    sellerExplanation: '',
    actionsTaken: '',
    affectedCount: '',
    supplierInfo: '',
    isODRSuspension: false
  });
  
  // Reference Selection State
  const [selectedRefId, setSelectedRefId] = useState<string>('');
  const [isAutoMatch, setIsAutoMatch] = useState<boolean>(false);
  
  // File Upload State
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [generatedPOAContent, setGeneratedPOAContent] = useState('');
  const [generatedCN, setGeneratedCN] = useState('');
  const [currentRisk, setCurrentRisk] = useState<RiskAnalysis | null>(null);

  // Library & Batch Processing State
  const [isAddingRef, setIsAddingRef] = useState(false);
  const [newRef, setNewRef] = useState<Partial<ReferenceCase>>({ title: '', type: 'Performance', content: '' });
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  
  const importJsonRef = useRef<HTMLInputElement>(null);
  const batchDocRef = useRef<HTMLInputElement>(null);

  // --- Auth Initialization ---
  useEffect(() => {
    const session = getCurrentSession();
    if (session) {
      setCurrentUser(session);
    }
    setIsAuthLoading(false);
  }, []);

  // --- Data Loading ---
  useEffect(() => {
    if (!currentUser) return;
    
    // 1. Load Local Settings
    const localSettings = loadSettings();
    setSettings(localSettings);
    
    // 2. Load References (Hybrid)
    const localRefs = loadReferences();
    setReferences(localRefs);

    if (localSettings.supabaseUrl && localSettings.supabaseKey) {
      handleCloudSync(localSettings);
    }
    
    // 3. Load Cases & Users
    const allCases = loadCases();
    // Admin and Super Admin can manage cases
    if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
      setCases(allCases);
      setUserList(getAllUsers());
    } else {
      setCases(allCases.filter(c => c.userId === currentUser.id));
      if (currentUser.companyName) {
        setFormData(prev => ({ ...prev, companyName: currentUser.companyName }));
      }
    }
  }, [currentUser]);

  const handleCloudSync = async (cfg: GlobalSettings) => {
    if (!cfg.supabaseUrl) return;
    setIsCloudSyncing(true);
    try {
      const { data, error } = await CloudService.getAllReferences(cfg);
      if (data && data.length > 0) {
        setReferences(data);
        saveReferences(data); 
      } else if (error) {
        console.error("Cloud Sync Error:", error);
      }
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // --- Logic: Auth Actions ---
  const handleLogout = () => {
    setCurrentSession(null);
    setCurrentUser(null);
    setCases([]);
    setReferences([]);
    setActiveTab(TABS.DASHBOARD);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (passwordForm.oldPassword !== currentUser.password) { alert("旧密码错误"); return; }
    if (passwordForm.newPassword.length < 4) { alert("新密码至少需要4位"); return; }
    const updatedUser = { ...currentUser, password: passwordForm.newPassword };
    updateUser(updatedUser);
    setCurrentUser(updatedUser);
    setCurrentSession(updatedUser);
    setIsChangePasswordOpen(false);
    setPasswordForm({ oldPassword: '', newPassword: '' });
    alert("密码修改成功！");
  };

  // --- Logic: User Management (Admin) ---
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if(!newUserForm.username || !newUserForm.password) return;
    try {
      registerUser(newUserForm.username, newUserForm.password, newUserForm.role, newUserForm.companyName);
      setUserList(getAllUsers());
      setIsAddingUser(false);
      setNewUserForm({ username: '', password: '', role: 'client', companyName: '' });
      alert("账号创建成功！");
    } catch(err:any) {
      alert(err.message);
    }
  };

  const handleDeleteUser = (id: string) => {
    if(id === currentUser?.id) { alert("无法删除自己"); return; }
    
    const targetUser = userList.find(u => u.id === id);
    if (!targetUser) return;

    // Hierarchy Check
    if (currentUser?.role === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'super_admin')) {
      alert("权限不足：管理员只能删除客户账号。");
      return;
    }

    if(window.confirm(`确定删除用户 [${targetUser.username}] 吗？该操作无法撤销。`)) {
      try {
        deleteUser(id);
        const updatedList = getAllUsers();
        setUserList(updatedList);
        // Force refresh just in case
        setTimeout(() => setUserList(getAllUsers()), 50);
      } catch (e: any) {
        alert("删除失败: " + e.message);
      }
    }
  };

  const handleStartEditUser = (user: UserType) => {
    setEditingUserId(user.id);
    setEditUserForm({ role: user.role, companyName: user.companyName || '' });
  };

  const handleSaveEditUser = (userId: string) => {
    const targetUser = userList.find(u => u.id === userId);
    if (!targetUser) return;
    
    // Hierarchy Check for Role Change
    if (currentUser?.role === 'admin' && editUserForm.role !== 'client') {
       if (editUserForm.role === 'admin' || editUserForm.role === 'super_admin') {
         alert("权限不足：普通管理员无法提升用户为管理员。");
         return;
       }
    }

    const updatedUser: UserType = {
      ...targetUser,
      role: editUserForm.role,
      companyName: editUserForm.companyName
    };
    updateUser(updatedUser);
    setUserList(getAllUsers());
    setEditingUserId(null);
  };

  const handleResetPassword = (user: UserType) => {
    // Hierarchy Check
    if (currentUser?.role === 'admin' && (user.role === 'admin' || user.role === 'super_admin')) {
      alert("权限不足：只能重置客户密码。");
      return;
    }
    const newPass = prompt(`请输入用户 [${user.username}] 的新密码:`);
    if(newPass) {
      updateUser({...user, password: newPass});
      setUserList(getAllUsers());
      alert("密码已重置");
    }
  };

  // --- Logic: Auto Match (Generator) ---
  useEffect(() => {
    if (activeTab === TABS.GENERATOR && isAutoMatch && formData.suspensionEmail && formData.violationType) {
      const typeMatches = references.filter(r => r.type === formData.violationType);
      
      if (typeMatches.length === 0) {
        setSelectedRefId('');
        return;
      }
      let bestMatchId = '';
      let maxScore = -1;
      typeMatches.forEach(ref => {
        const score = calculateSimilarity(formData.suspensionEmail!, ref.content);
        if (score > maxScore) { maxScore = score; bestMatchId = ref.id; }
      });
      if (bestMatchId) { setSelectedRefId(bestMatchId); }
    }
  }, [isAutoMatch, formData.suspensionEmail, formData.violationType, references, activeTab]);

  // Stats
  const stats = useMemo(() => {
    const total = cases.length;
    const success = cases.filter(c => c.status === 'success').length;
    const fail = cases.filter(c => c.status === 'fail').length;
    const pending = cases.filter(c => c.status === 'pending').length;
    const submitted = cases.filter(c => c.status === 'submitted').length;
    const decided = success + fail + submitted;
    const successRate = decided > 0 ? Math.round(((success + submitted) / decided) * 100) : 0;
    return { total, success, fail, pending, submitted, successRate };
  }, [cases]);

  const relevantReferences = useMemo(() => {
    return references.filter(r => r.type === formData.violationType);
  }, [references, formData.violationType]);

  // Modified: Return the risk analysis result directly for immediate use
  const analyzeRisk = (): RiskAnalysis => {
    const text = (formData.suspensionEmail || '').toLowerCase();
    let score = 75;
    const reasons: string[] = [];
    if (text.includes('counterfeit') || text.includes('inauthentic')) { score -= 20; reasons.push('高危: 涉及假货/真实性投诉 (-20)'); }
    if (text.includes('termination') || text.includes('final decision')) { score -= 30; reasons.push('极危: 终止合作/最终决定 (-30)'); }
    if (formData.violationType === 'IP') { score -= 10; reasons.push('类型: 知识产权/版权侵权 (-10)'); }
    if (text.includes('30 day') || text.includes('suspended for 14 days')) { score += 10; reasons.push('利好: 包含暂停期说明 (+10)'); }
    score = Math.max(0, Math.min(100, score));
    const level = score > 70 ? 'Low' : score > 40 ? 'Medium' : 'High';
    
    const analysis: RiskAnalysis = { score, level, reasons };
    setCurrentRisk(analysis);
    return analysis;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const parsedText = await parseFile(file);
      setFileContent(parsedText);
    } catch (err) {
      alert("文件解析失败: " + err);
      setFileName('');
    }
  };

  const handleRefDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await parseFile(file);
      setNewRef(prev => ({...prev, content: text, title: prev.title || file.name.replace(/\.[^/.]+$/, "") }));
    } catch (err) {
      alert("文档读取失败: " + err);
    }
  };

  const handleBatchDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBatchProgress({ current: 0, total: files.length });
    const newReferences: ReferenceCase[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await parseFile(file);
        let type: ViolationType = 'Performance';
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('ip')) type = 'IP';
        else if (lowerName.includes('counterfeit')) type = 'Counterfeit';

        const newRefObj = {
          id: Date.now().toString() + Math.random().toString().slice(2, 6),
          title: file.name.replace(/\.[^/.]+$/, ""),
          type: type,
          content: text,
          tags: ['Batch Upload']
        };
        newReferences.push(newRefObj);
        if (settings.supabaseUrl) { await CloudService.upsertReference(settings, newRefObj); }
      } catch (err) { console.warn(`Failed to parse ${file.name}`, err); }
      setBatchProgress({ current: i + 1, total: files.length });
      await new Promise(r => setTimeout(r, 10));
    }
    if (newReferences.length > 0) {
      const updated = [...references, ...newReferences];
      setReferences(updated);
      saveReferences(updated);
      alert(`成功导入 ${newReferences.length} 个文件！`);
    } else { alert("没有文件被成功解析。"); }
    setBatchProgress(null);
    if (batchDocRef.current) batchDocRef.current.value = '';
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const json = JSON.parse(ev.target?.result as string);
            if (Array.isArray(json)) {
              if (json.length > 0 && (!json[0].id || !json[0].content)) {
                alert("导入失败：JSON 格式不正确。");
                setIsImporting(false);
                return;
              }
              const confirmMsg = `检测到 ${json.length} 条数据。\n点击确定导入。`;
              if (window.confirm(confirmMsg)) {
                 const existingIds = new Set(references.map(r => r.id));
                 const newUniqueRefs = json.filter((r: ReferenceCase) => !existingIds.has(r.id));
                 const mergedRefs = [...references, ...newUniqueRefs];
                 setReferences(mergedRefs);
                 saveReferences(mergedRefs);
                 if (settings.supabaseUrl) {
                   for (const r of newUniqueRefs) { await CloudService.upsertReference(settings, r); }
                 }
                 alert(`导入完成！新增: ${newUniqueRefs.length} 条`);
              }
            } else { alert("导入失败：无效 JSON。"); }
          } catch (err) { alert("导入错误: " + err); } finally {
            setIsImporting(false);
            if (importJsonRef.current) importJsonRef.current.value = '';
          }
        };
        reader.readAsText(file);
    }, 100);
  };

  const handleGenerate = async () => {
    console.log("Handle generate triggered");
    const activeKey = settings.selectedProvider === 'deepseek' ? settings.deepseekKey : settings.apiKey;
    if (!activeKey) { 
        alert(`未配置 ${settings.selectedProvider === 'deepseek' ? 'DeepSeek' : 'Gemini'} API Key。\n请在“设置与管理”页面配置。`); 
        return; 
    }
    
    // Explicitly call analyzeRisk to get fresh data immediately, bypassing async state updates
    // This fixes the "No reaction" or "Null data" issue
    const freshRiskAnalysis = analyzeRisk();
    const similarCase = references.find(r => r.id === selectedRefId);

    setIsGenerating(true);
    try {
      console.log("Starting generation with provider:", settings.selectedProvider);
      const poa = await generatePOA(
        activeKey,
        formData, 
        settings, 
        freshRiskAnalysis.reasons, // Use the fresh data directly
        fileContent,
        similarCase
      );
      setGeneratedPOAContent(poa);
      
      const cn = await generateCNExplanation(activeKey, poa, formData.suspensionEmail || "");
      setGeneratedCN(cn);
    } catch (e: any) { 
      console.error("Generate error:", e);
      alert("生成失败: " + e.message); 
    } finally { 
      setIsGenerating(false); 
    }
  };

  const handleAutoFix = async () => {
    if (!generatedPOAContent || !generatedCN) return;
    const activeKey = settings.selectedProvider === 'deepseek' ? settings.deepseekKey : settings.apiKey;
    if (!activeKey) { alert("请先配置 API Key"); return; }
    setIsFixing(true);
    try {
        const fixedPOA = await autoFixPOA(activeKey, generatedPOAContent, generatedCN, settings);
        setGeneratedPOAContent(fixedPOA);
        alert("已根据指南自动修正 POA！");
    } catch (e:any) { alert("修正失败: " + e.message); } finally { setIsFixing(false); }
  };

  const handleCopy = () => {
    const cleanText = stripMarkdown(generatedPOAContent);
    navigator.clipboard.writeText(cleanText).then(() => {
      alert("复制成功！");
    });
  };

  const saveCurrentCase = () => {
    if (!generatedPOAContent || !currentUser) return;
    const newCase: CaseData = {
      id: Date.now().toString(),
      userId: currentUser.id,
      clientName: currentUser.username,
      createdAt: new Date().toISOString(),
      ...formData as any,
      poaContent: generatedPOAContent,
      cnExplanation: generatedCN,
      status: 'pending',
      fileEvidenceSummary: fileName ? `Used data from: ${fileName}` : undefined
    };
    const allCases = loadCases();
    const updatedGlobal = [newCase, ...allCases];
    saveCases(updatedGlobal);
    setCases([newCase, ...cases]);
    alert("案件已保存！");
  };

  const updateCaseStatus = (id: string, status: CaseData['status']) => {
    const allCases = loadCases();
    const updatedGlobal = allCases.map(c => c.id === id ? { ...c, status } : c);
    saveCases(updatedGlobal);
    setCases(cases.map(c => c.id === id ? { ...c, status } : c));
  };

  const handleSubmitToWalmart = async () => {
    if (!reviewCase) return;
    setIsSubmitting(true);
    try {
      const result = await submitPOAToWalmart(reviewCase, settings);
      if (result.success) {
        const updatedCase: CaseData = {
          ...reviewCase,
          status: 'submitted',
          submissionTime: new Date().toISOString(),
          walmartCaseNumber: result.caseNumber
        };
        const allCases = loadCases();
        const updatedGlobal = allCases.map(c => c.id === reviewCase.id ? updatedCase : c);
        saveCases(updatedGlobal);
        setCases(updatedGlobal.filter(c => currentUser?.role === 'admin' || c.userId === currentUser?.id));
        alert(`提交成功！\nCase ID: ${result.caseNumber}`);
        setReviewCase(null);
      } else { alert(`提交失败: ${result.message}`); }
    } catch (e: any) { alert("系统错误: " + e.message); } finally { setIsSubmitting(false); }
  };
  
  const saveReviewEdits = () => {
    if(!reviewCase) return;
    const allCases = loadCases();
    const updatedGlobal = allCases.map(c => c.id === reviewCase.id ? reviewCase : c);
    saveCases(updatedGlobal);
    setCases(updatedGlobal.filter(c => currentUser?.role === 'admin' || c.userId === currentUser?.id));
    alert("修改已保存！");
  };

  // --- Reference Library Actions ---
  const saveReference = async () => {
    if (!newRef.title || !newRef.content) return;
    const item: ReferenceCase = {
      id: Date.now().toString(),
      title: newRef.title!,
      type: newRef.type as ViolationType,
      content: newRef.content!,
      tags: []
    };
    const updated = [...references, item];
    setReferences(updated);
    saveReferences(updated);
    if (settings.supabaseUrl) { await CloudService.upsertReference(settings, item); }
    setIsAddingRef(false);
    setNewRef({ title: '', type: 'Performance', content: '' });
  };

  const deleteReference = async (id: string) => {
    if (!window.confirm("确定删除此成功案例吗？")) return;
    const updated = references.filter(r => r.id !== id);
    setReferences(updated);
    saveReferences(updated);
    if (settings.supabaseUrl) { await CloudService.deleteReference(settings, id); }
  };

  // --- Render ---
  if (!currentUser && !isAuthLoading) {
    return <LoginScreen onLogin={(user) => {
      setCurrentUser(user);
      setCurrentSession(user);
    }} />;
  }

  // Determine if user has access to Settings
  const canAccessSettings = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  return (
    <div className="min-h-screen flex text-sm relative animate-fade-in">
      
      {/* GLOBAL LOADING OVERLAY */}
      {(isImporting || batchProgress || isCloudSyncing) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center flex-col animate-fade-in">
           {isCloudSyncing ? <CloudLightning className="w-12 h-12 text-emerald-400 animate-pulse mb-4"/> : <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />}
           <div className="text-xl font-bold text-slate-200">
             {isCloudSyncing ? "正在与云数据库同步..." : batchProgress ? `正在解析文档 (${batchProgress.current}/${batchProgress.total})` : "正在处理..."}
           </div>
        </div>
      )}
      
      {/* ADMIN REVIEW MODAL */}
      {reviewCase && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-2xl">
                 <div className="flex items-center gap-3">
                   <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400"><Gavel size={20}/></div>
                   <div><h3 className="text-lg font-bold text-slate-200">案件审核</h3><div className="text-xs text-slate-500 flex gap-2"><span>ID: {reviewCase.caseId}</span></div></div>
                 </div>
                 <button onClick={() => setReviewCase(null)} className="text-slate-500 hover:text-white"><XCircle size={24}/></button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                 <div className="w-1/3 border-r border-slate-800 p-6 overflow-y-auto bg-slate-900/50">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">案件背景</h4>
                    <div className="space-y-4">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800"><div className="text-slate-200 font-bold">{reviewCase.storeName}</div></div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 h-32 overflow-y-auto">{reviewCase.suspensionEmail}</div>
                    </div>
                 </div>
                 <div className="w-2/3 flex flex-col bg-slate-950">
                    <div className="flex-1 p-6 overflow-y-auto">
                       <textarea className="w-full h-full min-h-[500px] bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-300 font-mono text-sm leading-relaxed outline-none" value={reviewCase.poaContent} onChange={(e) => setReviewCase({...reviewCase, poaContent: e.target.value})}></textarea>
                    </div>
                 </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-900 rounded-b-2xl flex justify-between">
                 <button onClick={saveReviewEdits} className="px-4 py-2 border border-slate-700 rounded-lg text-slate-400 text-xs font-bold"><Save size={14}/> 仅保存</button>
                 <div className="flex gap-3">
                    <button onClick={() => { setReviewCase({...reviewCase, status: 'fail'}); saveReviewEdits(); setReviewCase(null); }} className="text-rose-400 text-xs font-bold px-4">驳回</button>
                    <button onClick={handleSubmitToWalmart} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-xs flex gap-2 items-center">{isSubmitting ? <Loader2 className="animate-spin"/> : <Send size={14}/>} 提交</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
           <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-96 shadow-2xl relative">
              <button onClick={() => setIsChangePasswordOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><XCircle size={20}/></button>
              <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><KeyRound size={20}/> 修改密码</h3>
              <form onSubmit={handleChangePassword} className="space-y-4">
                 <input type="password" placeholder="新密码" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}/>
                 <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-xs">确认</button>
              </form>
           </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/90 backdrop-blur-xl border-r border-slate-800 flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">泽远跨境 V5</h1>
          <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
             <span>内部专用版</span>
             <span className="uppercase text-emerald-400">{currentUser?.role.replace('_', ' ')}</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: TABS.DASHBOARD, label: '仪表盘', icon: LayoutDashboard, role: 'all' },
            { id: TABS.LIBRARY, label: '成功案例库', icon: Library, role: 'admin' }, // admin includes super_admin in checks usually
            { id: TABS.GENERATOR, label: 'POA 智能生成', icon: FileText, role: 'all' },
            { id: TABS.HISTORY, label: '案件历史库', icon: History, role: 'all' },
            { id: TABS.SETTINGS, label: '设置与管理', icon: Settings, role: 'admin' }, 
          ].filter(item => {
             // Role visibility logic
             if (item.role === 'all') return true;
             if (item.role === 'admin') return currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
             return false;
          }).map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === item.id ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50'}`}>
              <item.icon size={18} /> <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-slate-800">
           <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-xs text-rose-400 py-2 hover:bg-rose-500/10 rounded-lg"><LogOut size={14}/> 退出</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        
        {/* DASHBOARD TAB */}
        {activeTab === TABS.DASHBOARD && (
          <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
            {/* ... Dashboard Stats & Charts ... */}
            <div className="grid grid-cols-4 gap-4">
               {/* Simplified stats display */}
               <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800"><div className="text-slate-500">总案件</div><div className="text-3xl font-bold text-slate-200">{stats.total}</div></div>
               <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800"><div className="text-slate-500">成功率</div><div className="text-3xl font-bold text-emerald-400">{stats.successRate}%</div></div>
            </div>

            {/* Cloud Status Card */}
            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl relative overflow-hidden">
                <div className="flex items-center gap-4">
                   <div className={`p-3 rounded-xl ${settings.supabaseUrl ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {settings.supabaseUrl ? <CloudLightning size={24}/> : <Cloud size={24}/>}
                   </div>
                   <div>
                      <h3 className="text-lg font-bold text-slate-200">云端数据库状态</h3>
                      <p className="text-sm text-slate-500">
                         {settings.supabaseUrl ? "已连接 Supabase 云端，案例库将自动同步。" : "未连接。当前仅使用本地浏览器缓存 (Local Storage)。"}
                      </p>
                   </div>
                   {settings.supabaseUrl && (
                      <button onClick={() => handleCloudSync(settings)} className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                         <RefreshCw size={14} className={isCloudSyncing ? "animate-spin" : ""}/> 立即同步
                      </button>
                   )}
                </div>
            </div>
          </div>
        )}

        {/* LIBRARY TAB (ADMIN ONLY) */}
        {activeTab === TABS.LIBRARY && canAccessSettings && (
          <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
             <div className="flex justify-between items-center">
               <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2"><Library className="text-blue-500"/> 成功案例库</h2>
               <div className="flex gap-3">
                 <input type="file" multiple className="hidden" ref={batchDocRef} onChange={handleBatchDocUpload} />
                 <button onClick={() => batchDocRef.current?.click()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold"><UploadCloud size={14}/> 批量上传</button>
                 <button onClick={() => setIsAddingRef(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold"><Plus size={14}/> 新增</button>
               </div>
             </div>

             {isAddingRef && (
               <div className="bg-slate-900/80 border border-blue-500/30 p-6 rounded-2xl space-y-4 shadow-2xl">
                  {/* ... Add Form ... */}
                  <div className="flex justify-between"><h3 className="text-white font-bold">录入新案例</h3><button onClick={() => setIsAddingRef(false)}><XCircle size={18}/></button></div>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded p-3" placeholder="标题" value={newRef.title} onChange={e => setNewRef({...newRef, title: e.target.value})}/>
                  <select className="bg-slate-950 border border-slate-800 rounded p-3" value={newRef.type} onChange={e => setNewRef({...newRef, type: e.target.value as any})}>
                     {['Performance', 'IP', 'Counterfeit'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <textarea className="w-full bg-slate-950 border border-slate-800 rounded p-4 h-48" placeholder="内容..." value={newRef.content} onChange={e => setNewRef({...newRef, content: e.target.value})}></textarea>
                  <button onClick={saveReference} className="bg-blue-600 text-white px-6 py-2 rounded font-bold w-full">保存入库</button>
               </div>
             )}

             <div className="grid grid-cols-3 gap-4">
                {references.map(ref => (
                  <div key={ref.id} className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl group relative">
                     <button onClick={() => deleteReference(ref.id)} className="absolute top-4 right-4 text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                     <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 mb-2 inline-block">{ref.type}</span>
                     <h3 className="text-slate-200 font-bold mb-2 truncate">{ref.title}</h3>
                     <p className="text-slate-500 text-xs line-clamp-4 font-mono">{ref.content.substring(0, 100)}...</p>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* GENERATOR TAB */}
        {activeTab === TABS.GENERATOR && (
           <div className="grid grid-cols-12 gap-6 h-[calc(100vh-6rem)]">
              <div className="col-span-5 flex flex-col gap-4 overflow-y-auto pr-2 pb-10">
                 {/* Simplified Generator Inputs for brevity in this response */}
                 <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <h3 className="text-slate-200 font-bold flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-blue-500 text-white flex items-center justify-center text-xs">1</div> 
                        案情诊断
                    </h3>
                    
                    {/* Display Current Provider */}
                    <div className="text-[10px] bg-slate-800 text-slate-400 p-2 rounded flex justify-between items-center">
                        <span>当前 AI 引擎: <span className="text-emerald-400 font-bold uppercase">{settings.selectedProvider}</span></span>
                        <button onClick={() => setActiveTab(TABS.SETTINGS)} className="underline hover:text-white">切换</button>
                    </div>

                    <textarea className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-300 h-24 text-xs" placeholder="粘贴 Walmart 邮件..." value={formData.suspensionEmail} onChange={e => setFormData({...formData, suspensionEmail: e.target.value})} onBlur={() => analyzeRisk()}></textarea>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-500 text-xs mb-1 block">违规类型</label>
                        <select 
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 text-xs" 
                          value={formData.violationType} 
                          onChange={e => {
                            const type = e.target.value as ViolationType;
                            setFormData({...formData, violationType: type, isODRSuspension: type === 'Performance' ? formData.isODRSuspension : false});
                          }}
                        >
                           <option value="Performance">Performance</option><option value="IP">IP</option>
                           <option value="Counterfeit">Counterfeit</option><option value="Related">Related</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-500 text-xs mb-1 block">供应链</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 text-xs" value={formData.supplyChain} onChange={e => setFormData({...formData, supplyChain: e.target.value as any})}><option value="Private Label">Private Label</option><option value="Dropshipping">Dropshipping</option></select>
                      </div>
                    </div>

                    {/* ODR SUSPENSION TOGGLE */}
                    {formData.violationType === 'Performance' && (
                       <div className={`p-3 rounded-xl border transition-all ${formData.isODRSuspension ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950 border-slate-800'}`}>
                          <div className="flex items-center gap-3">
                             <button 
                               onClick={() => setFormData({...formData, isODRSuspension: !formData.isODRSuspension})}
                               className={`w-10 h-5 rounded-full relative transition-colors ${formData.isODRSuspension ? 'bg-amber-500' : 'bg-slate-700'}`}
                             >
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${formData.isODRSuspension ? 'left-6' : 'left-1'}`}></div>
                             </button>
                             <div className="flex-1">
                                <div className={`text-sm font-bold ${formData.isODRSuspension ? 'text-amber-400' : 'text-slate-400'}`}>
                                  ODR 自发货权限申诉模式
                                </div>
                                <div className="text-[10px] text-slate-500 leading-tight mt-1">
                                   启用后，AI 将严格控制在 3 个段落，每个段落 <span className="font-bold text-amber-500">700-950 字符</span>，以符合 Walmart 自发货申诉限制。
                                </div>
                             </div>
                             {formData.isODRSuspension && <AlertTriangle size={16} className="text-amber-500"/>}
                          </div>
                       </div>
                    )}
                 </div>
                 
                 {/* Evidence Injection */}
                 <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-2">
                    <h3 className="text-slate-200 font-bold text-sm flex items-center gap-2"><div className="w-6 h-6 rounded bg-emerald-600 text-white flex items-center justify-center text-xs">2</div> 证据注入</h3>
                    <div className="relative border-2 border-dashed border-slate-800 rounded-lg p-4 text-center hover:bg-slate-800/50">
                       <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
                       <div className="text-xs text-slate-500">{fileName || "拖入 Excel/CSV"}</div>
                    </div>
                 </div>

                 {/* Identity & Button */}
                 <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-4">
                    <h3 className="text-slate-200 font-bold text-sm flex items-center gap-2"><div className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center text-xs">3</div> 信息</h3>
                    <div className="grid grid-cols-2 gap-2">
                       <input className="bg-slate-950 border border-slate-800 rounded p-2 text-xs" placeholder="公司名" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})}/>
                       <input className="bg-slate-950 border border-slate-800 rounded p-2 text-xs" placeholder="店铺名" value={formData.storeName} onChange={e => setFormData({...formData, storeName: e.target.value})}/>
                    </div>
                    <button onClick={handleGenerate} disabled={isGenerating} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
                       {isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles size={18}/>} 生成 POA ({settings.selectedProvider})
                    </button>
                 </div>
              </div>

              {/* Right Panel */}
              <div className="col-span-7 flex flex-col gap-4 pb-10">
                 <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                    <div className="bg-slate-950 border-b border-slate-800 p-3 flex justify-between items-center">
                       <div className="flex gap-2">
                         <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded">POA 预览</span>
                         {formData.isODRSuspension && <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">ODR 限字模式 (3段式)</span>}
                       </div>
                       <button onClick={handleCopy}><Copy size={16}/></button>
                    </div>
                    <div className="flex-1 p-6 font-mono text-sm overflow-auto text-slate-300 whitespace-pre-wrap leading-relaxed">{generatedPOAContent}</div>
                 </div>
                 <div className="h-48 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                    <div className="bg-slate-950 border-b border-slate-800 p-2 px-4 flex justify-between">
                       <span className="text-xs font-bold text-slate-400">中文指南</span>
                       <button onClick={handleAutoFix} className="flex items-center gap-1 text-[10px] bg-emerald-600 text-white px-2 py-1 rounded">{isFixing ? <RefreshCw size={10} className="animate-spin"/> : <Wand2 size={10}/>} 一键精修</button>
                    </div>
                    <div className="flex-1 p-4 text-xs text-slate-400 overflow-auto whitespace-pre-wrap">{generatedCN}</div>
                 </div>
              </div>
           </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === TABS.SETTINGS && canAccessSettings && (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
             {/* Cloud Database Config - ADMIN ONLY */}
             {currentUser?.role === 'super_admin' && ( // Only super_admin can configure database for safety, or allow admin too if needed
             <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-20 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                  <Cloud size={20} className="text-emerald-500"/> 云端数据库配置 (Supabase)
                </h3>
                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                     <div className={`mt-1 p-1 rounded-full ${settings.supabaseUrl ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                        {settings.supabaseUrl ? <Wifi size={14} className="text-white"/> : <WifiOff size={14} className="text-slate-400"/>}
                     </div>
                     <div className="flex-1">
                        <div className="text-sm font-bold text-slate-200">
                           {settings.supabaseUrl ? "已配置云端连接" : "离线模式 (Local Only)"}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                           配置 Supabase 后，系统将自动同步“成功案例库”至云端。
                        </p>
                     </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs text-slate-500 uppercase font-bold">Project URL</label>
                      <input 
                         type="text" 
                         placeholder="https://xyz.supabase.co"
                         className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 outline-none focus:border-emerald-500"
                         value={settings.supabaseUrl}
                         onChange={(e) => {
                            const s = { ...settings, supabaseUrl: e.target.value };
                            setSettings(s); saveSettings(s);
                         }}
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs text-slate-500 uppercase font-bold">API Key (anon/public)</label>
                      <input 
                         type="password" 
                         placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                         className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 outline-none focus:border-emerald-500"
                         value={settings.supabaseKey}
                         onChange={(e) => {
                            const s = { ...settings, supabaseKey: e.target.value };
                            setSettings(s); saveSettings(s);
                         }}
                      />
                   </div>
                </div>
                
                {settings.supabaseUrl && (
                  <div className="mt-4 flex justify-end">
                     <button onClick={() => handleCloudSync(settings)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                        <RefreshCw size={14} className={isCloudSyncing ? "animate-spin" : ""}/> 测试连接并同步
                     </button>
                  </div>
                )}
             </div>
             )}

             {/* API Keys (Existing) - VISIBLE TO ALL ADMINS */}
             <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Settings size={20}/> AI 引擎配置</h3>
                
                <div className="bg-slate-800/50 p-4 rounded-xl mb-4 border border-slate-700">
                    <div className="text-xs font-bold text-slate-400 mb-2 uppercase">首选 AI 供应商</div>
                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="radio" 
                                name="provider" 
                                checked={settings.selectedProvider === 'gemini'} 
                                onChange={() => { 
                                    const s = {...settings, selectedProvider: 'gemini'}; 
                                    setSettings(s); 
                                    saveSettings(s); 
                                }} 
                                className="accent-blue-500 w-4 h-4"
                            />
                            <div className="flex flex-col">
                                <span className={`font-bold ${settings.selectedProvider === 'gemini' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Google Gemini</span>
                                <span className="text-[10px] text-slate-500">速度快，免费额度高，推荐默认</span>
                            </div>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="radio" 
                                name="provider" 
                                checked={settings.selectedProvider === 'deepseek'} 
                                onChange={() => { 
                                    const s = {...settings, selectedProvider: 'deepseek'}; 
                                    setSettings(s); 
                                    saveSettings(s); 
                                }} 
                                className="accent-blue-500 w-4 h-4"
                            />
                            <div className="flex flex-col">
                                <span className={`font-bold ${settings.selectedProvider === 'deepseek' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>DeepSeek V3</span>
                                <span className="text-[10px] text-slate-500">逻辑推理强，中文理解极佳</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={`space-y-2 p-3 rounded-lg border transition-all ${settings.selectedProvider === 'gemini' ? 'border-blue-500/50 bg-blue-500/5' : 'border-transparent'}`}>
                    <label className="text-slate-400 text-xs font-bold flex justify-between">
                        Google Gemini Key
                        {settings.selectedProvider === 'gemini' && <span className="text-blue-400 text-[10px]">● 当前激活</span>}
                    </label>
                    <input type="password" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" value={settings.apiKey} onChange={(e) => { const s = {...settings, apiKey: e.target.value}; setSettings(s); saveSettings(s); }}/>
                  </div>
                  <div className={`space-y-2 p-3 rounded-lg border transition-all ${settings.selectedProvider === 'deepseek' ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-transparent'}`}>
                    <label className="text-slate-400 text-xs font-bold flex justify-between">
                        DeepSeek Key
                        {settings.selectedProvider === 'deepseek' && <span className="text-indigo-400 text-[10px]">● 当前激活</span>}
                    </label>
                    <input type="password" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" value={settings.deepseekKey} onChange={(e) => { const s = {...settings, deepseekKey: e.target.value}; setSettings(s); saveSettings(s); }}/>
                  </div>
                </div>
             </div>

             {/* User Management */}
             <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2"><Users size={20}/> 员工账号管理</h3>
                   <button onClick={() => setIsAddingUser(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><UserPlus size={14}/> 新增账号</button>
                </div>

                {isAddingUser && (
                   <form onSubmit={handleCreateUser} className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 mb-6 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                         <input className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" placeholder="用户名" value={newUserForm.username} onChange={e => setNewUserForm({...newUserForm, username: e.target.value})}/>
                         <input className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" placeholder="密码" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <select className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" value={newUserForm.role} onChange={e => setNewUserForm({...newUserForm, role: e.target.value as any})}>
                             <option value="client">客户 (Client)</option>
                             {currentUser?.role === 'super_admin' && <option value="admin">管理员 (Admin)</option>}
                             {currentUser?.role === 'super_admin' && <option value="super_admin">总管理员 (Super Admin)</option>}
                         </select>
                         <input className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300" placeholder="所属公司/备注" value={newUserForm.companyName} onChange={e => setNewUserForm({...newUserForm, companyName: e.target.value})}/>
                      </div>
                      <div className="flex justify-end gap-2">
                         <button type="button" onClick={() => setIsAddingUser(false)} className="text-slate-500 px-4 py-2">取消</button>
                         <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-xs">创建</button>
                      </div>
                   </form>
                )}

                <div className="overflow-hidden rounded-xl border border-slate-800">
                   <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-bold uppercase"><tr><th className="p-3">账号</th><th className="p-3">角色</th><th className="p-3">公司备注</th><th className="p-3 text-right">操作</th></tr></thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                         {userList.map(user => (
                            <tr key={user.id} className="hover:bg-slate-800/50 group">
                               <td className="p-3 text-slate-300 font-medium flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-500"><User size={12}/></div>
                                  {user.username} 
                                  {user.id === currentUser?.id && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">YOU</span>}
                               </td>
                               <td className="p-3">
                                  {editingUserId === user.id ? (
                                     <select 
                                        className="bg-slate-950 border border-slate-700 rounded p-1 text-slate-200"
                                        value={editUserForm.role} 
                                        onChange={e => setEditUserForm({...editUserForm, role: e.target.value as UserRole})}
                                     >
                                         <option value="client">客户</option>
                                         {currentUser?.role === 'super_admin' && <option value="admin">管理员</option>}
                                         {currentUser?.role === 'super_admin' && <option value="super_admin">总管理员</option>}
                                     </select>
                                  ) : (
                                     <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold flex w-fit items-center gap-1
                                        ${user.role === 'super_admin' ? 'bg-fuchsia-500/20 text-fuchsia-400' : 
                                          user.role === 'admin' ? 'bg-indigo-500/20 text-indigo-400' : 
                                          'bg-slate-700 text-slate-400'}`}>
                                          {user.role === 'super_admin' && <Crown size={10} />}
                                          {user.role.replace('_', ' ')}
                                     </span>
                                  )}
                               </td>
                               <td className="p-3 text-slate-500">
                                   {editingUserId === user.id ? (
                                      <input 
                                         className="bg-slate-950 border border-slate-700 rounded p-1 text-slate-200 w-full"
                                         value={editUserForm.companyName}
                                         onChange={e => setEditUserForm({...editUserForm, companyName: e.target.value})}
                                      />
                                   ) : (
                                      user.companyName || '-'
                                   )}
                               </td>
                               <td className="p-3 text-right space-x-2">
                                  {editingUserId === user.id ? (
                                     <>
                                        <button onClick={() => handleSaveEditUser(user.id)} className="text-emerald-400 hover:text-emerald-300 font-bold"><CheckCircle size={16}/></button>
                                        <button onClick={() => setEditingUserId(null)} className="text-slate-500 hover:text-slate-300"><XCircle size={16}/></button>
                                     </>
                                  ) : (
                                     <>
                                        <button onClick={() => handleResetPassword(user)} className="text-blue-400 hover:text-blue-300 font-bold" title="重置密码"><KeyRound size={16}/></button>
                                        
                                        {/* Edit Button: Visible if current user is super admin OR target is client */}
                                        {(currentUser?.role === 'super_admin' || (currentUser?.role === 'admin' && user.role === 'client')) && (
                                            <button onClick={() => handleStartEditUser(user)} className="text-amber-400 hover:text-amber-300 font-bold" title="编辑信息"><Edit2 size={16}/></button>
                                        )}
                                        
                                        {/* Delete Button: Visible if not self AND (current is super_admin OR (current is admin AND target is client)) */}
                                        {user.id !== currentUser?.id && (currentUser?.role === 'super_admin' || (currentUser?.role === 'admin' && user.role === 'client')) && (
                                            <button onClick={() => handleDeleteUser(user.id)} className="text-rose-400 hover:text-rose-300 font-bold" title="删除用户"><Trash2 size={16}/></button>
                                        )}
                                     </>
                                  )}
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
}

// Login Screen Component
const LoginScreen = ({ onLogin }: { onLogin: (user: UserType) => void }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // When registering from login screen, default to client. Only Admin panel can create Admins.
  const role: UserRole = 'client'; 
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegister) {
        // Self-registration is always Client role
        const user = registerUser(username, password, 'client', 'My Company');
        onLogin(user);
      } else {
        const user = loginUser(username, password);
        onLogin(user);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950">
       <div className="w-full max-w-md p-8 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">泽远跨境 · 风控系统</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
             <input className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200" placeholder="账号" value={username} onChange={e => setUsername(e.target.value)}/>
             <input type="password" className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-slate-200" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)}/>
             
             {/* Removed Role Selection from Login Screen - Logic is now centralized in Admin Panel */}
             
             <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">{isRegister ? '注册' : '登录'}</button>
          </form>
          <div className="mt-4 text-center"><button onClick={() => setIsRegister(!isRegister)} className="text-slate-500 text-xs">{isRegister ? '返回登录' : '创建账号'}</button></div>
       </div>
    </div>
  );
};

export default App;