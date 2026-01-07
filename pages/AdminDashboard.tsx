
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, KnowledgeBaseItem, PoaType, POA_TYPE_MAPPING } from '../types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, updateUserBalance, changePassword, supabase, uploadPaymentQr, getUsers, saveSystemConfig, getSystemConfig, updateAnyUser, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase, searchKnowledgeBase, incrementKbUsage, uploadAppealEvidence } from '../services/storageService';
import { 
  CheckCircle, XCircle, Clock, Search, Edit3, DollarSign, 
  BrainCircuit, Save, X, Filter, Loader2, Bell,
  FileText, FileSpreadsheet, Download, File, QrCode, Upload, Users, ShieldAlert, Settings, AlertTriangle, TrendingUp, RefreshCw, Eye, Sparkles, BookOpen, Trash2, Copy, FilePlus, Link, Github, Terminal, ListChecks, Calendar, Store, Hash, ChevronDown, ChevronRight, Layers, MessageSquarePlus, Table, Database, ExternalLink, Key
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { useToast } from '../components/Toast';

interface AdminDashboardProps {
  currentUser: User;
}

// --- Helper: Random Name Generator for POA ---
const getRandomNames = () => {
  const firstNames = ['Mike', 'David', 'Sarah', 'Jessica', 'James', 'Wei', 'Lei', 'Hui', 'Emily', 'Robert', 'Chris', 'Amanda'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Chen', 'Wang', 'Liu', 'Zhang', 'Miller', 'Davis', 'Wu', 'Rodriguez', 'Lee'];
  
  const generate = () => {
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${first} ${last}`;
  };

  return {
    manager: generate(),
    warehouse: generate(),
    cs: generate(),
    compliance: generate()
  };
};

// --- Smart Classification Logic ---
const autoClassifyPoa = (filename: string): { type: PoaType, subType: string } | null => {
  const name = filename.toLowerCase();

  // 1. Fulfillment Suspension (自发货权限)
  if (name.includes('自发货') || name.includes('fulfillment') || name.includes('permission')) {
    if (name.includes('otd') || name.includes('late') || name.includes('迟发')) {
      return { type: PoaType.FULFILLMENT_SUSPENSION, subType: 'OTD (发货及时率低) - 暂停自发货' };
    }
    if (name.includes('vtr') || name.includes('tracking') || name.includes('追踪')) {
      return { type: PoaType.FULFILLMENT_SUSPENSION, subType: 'VTR (物流追踪率低) - 暂停自发货' };
    }
    return { type: PoaType.FULFILLMENT_SUSPENSION, subType: POA_TYPE_MAPPING[PoaType.FULFILLMENT_SUSPENSION][0] };
  }

  // 2. Account Suspension (店铺封号)
  
  // Performance (OTD/VTR)
  if (name.includes('otd') || name.includes('发货及时') || name.includes('late shipment')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: 'OTD (发货及时率低) - 导致封店' };
  }
  if (name.includes('vtr') || name.includes('追踪') || name.includes('valid tracking')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: 'VTR (物流追踪率低) - 导致封店' };
  }
  if (name.includes('cancel') || name.includes('取消率')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: '取消率过高 - 导致封店' };
  }

  // IP / Infringement
  if (name.includes('ip') || name.includes('infringement') || name.includes('侵权') || name.includes('rights') || name.includes('counterfeit') || name.includes('假冒')) {
     if (name.includes('trademark') || name.includes('商标')) return { type: PoaType.ACCOUNT_SUSPENSION, subType: '知识产权 - 商标侵权 (Trademark)' };
     if (name.includes('patent') || name.includes('专利')) return { type: PoaType.ACCOUNT_SUSPENSION, subType: '知识产权 - 专利侵权 (Patent)' };
     if (name.includes('copyright') || name.includes('版权')) return { type: PoaType.ACCOUNT_SUSPENSION, subType: '知识产权 - 版权侵权 (Copyright)' };
     return { type: PoaType.ACCOUNT_SUSPENSION, subType: '知识产权 - 假冒商品 (Counterfeit)' };
  }

  // Other Common Issues
  if (name.includes('linked') || name.includes('related') || name.includes('关联')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: '关联账户 (Related Accounts)' };
  }
  if (name.includes('review') || name.includes('manipulation') || name.includes('评论') || name.includes('刷单')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: '操控评论 (Review Manipulation)' };
  }
  if (name.includes('verify') || name.includes('identity') || name.includes('身份') || name.includes('二审')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: '二审/身份验证 (Identity Verification)' };
  }
  if (name.includes('fraud') || name.includes('欺诈')) {
    return { type: PoaType.ACCOUNT_SUSPENSION, subType: '客户欺诈投诉 (Customer Fraud Complaint)' };
  }

  return null; // Fallback to user selection
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'appeals' | 'finance' | 'users' | 'security' | 'brain'>('appeals');
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  
  // --- Search & Filter State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Edit Modal State
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editDeduction, setEditDeduction] = useState<number>(0);
  
  // V2 AI Writer State
  const [aiPoaType, setAiPoaType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [aiPoaSubType, setAiPoaSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  
  // NEW: Detailed Fields for AI
  const [aiRootCause, setAiRootCause] = useState('');
  const [aiStoreName, setAiStoreName] = useState('');
  const [aiPartnerId, setAiPartnerId] = useState('');
  const [aiDate, setAiDate] = useState(new Date().toISOString().split('T')[0]);
  const [aiCustomInstructions, setAiCustomInstructions] = useState(''); 
  
  // NEW: Specific Data Points for Tables
  const [aiTableExtract, setAiTableExtract] = useState(''); // Textarea for pasting excel rows
  const [aiMetricCurrent, setAiMetricCurrent] = useState(''); // e.g. 90.8%
  const [aiMetricTarget, setAiMetricTarget] = useState(''); // e.g. 99%
  const [isAnalyzingExcel, setIsAnalyzingExcel] = useState(false);

  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGeneratingPoa, setIsGeneratingPoa] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1); // 1: Inputs, 2: Result
  const [ragReferences, setRagReferences] = useState<string[]>([]); // To show used references

  // Lightbox State
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // QR Code State
  const [currentQrUrl, setCurrentQrUrl] = useState('');
  
  // Contact & Marketing Config State
  const [contactInfo, setContactInfo] = useState('');
  const [marketingBaseCases, setMarketingBaseCases] = useState<number>(3500);
  const [marketingSuccessRate, setMarketingSuccessRate] = useState<string>('98.8');
  const [marketingBaseProcessing, setMarketingBaseProcessing] = useState<number>(15);
  
  // Security State
  const [newPassword, setNewPassword] = useState('');

  // User Management State (Super Admin)
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Knowledge Base State
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseItem[]>([]);
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');
  const [kbType, setKbType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [kbSubType, setKbSubType] = useState<string>(POA_TYPE_MAPPING[kbType][0]);
  const [kbFileUploading, setKbFileUploading] = useState(false);
  const [kbUploadLogs, setKbUploadLogs] = useState<string[]>([]);
  
  // KB UI State (Folding)
  const [expandedKbGroups, setExpandedKbGroups] = useState<Record<string, boolean>>({
    [PoaType.ACCOUNT_SUSPENSION]: true,
    [PoaType.FULFILLMENT_SUSPENSION]: true,
    [PoaType.OTHER]: false
  });

  const isSuperAdmin = currentUser.role === UserRole.SUPER_ADMIN;
  
  // Check API Key Status immediately
  const isApiKeyConfigured = !!process.env.API_KEY;

  const loadData = useCallback(async () => {
    // Parallel fetching for performance
    const [fetchedAppeals, fetchedTxs, fetchedConfig] = await Promise.all([
      getAppeals(),
      getTransactions(),
      getSystemConfig()
    ]);
    
    setAppeals(fetchedAppeals);
    setTransactions(fetchedTxs);
    
    if (fetchedConfig) {
      setContactInfo(fetchedConfig.contactInfo || '');
      if (fetchedConfig.paymentQrUrl) {
        setCurrentQrUrl(fetchedConfig.paymentQrUrl);
      }
      setMarketingBaseCases(fetchedConfig.marketingBaseCases ?? 3500);
      setMarketingSuccessRate(fetchedConfig.marketingSuccessRate || '98.8');
      setMarketingBaseProcessing(fetchedConfig.marketingBaseProcessing ?? 15);
    }
    
    if (isSuperAdmin) {
      const u = await getUsers();
      setAllUsers(u);
    }
    
    // Load Knowledge Base
    if (isSuperAdmin) {
      const kb = await getKnowledgeBase();
      setKnowledgeBase(kb);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();

    // --- REALTIME SUBSCRIPTIONS ---
    const appealChannel = supabase.channel('admin-appeals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appeals' }, () => loadData())
      .subscribe();

    const txChannel = supabase.channel('admin-txs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadData())
      .subscribe();
      
    let userChannel: any;
    if (isSuperAdmin) {
       userChannel = supabase.channel('admin-users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadData())
        .subscribe();
    }

    return () => {
      supabase.removeChannel(appealChannel);
      supabase.removeChannel(txChannel);
      if (userChannel) supabase.removeChannel(userChannel);
    };
  }, [loadData, isSuperAdmin]);

  // Update AI SubType when Type changes
  useEffect(() => {
    setAiPoaSubType(POA_TYPE_MAPPING[aiPoaType][0]);
  }, [aiPoaType]);

  // Update KB SubType when Type changes
  useEffect(() => {
    setKbSubType(POA_TYPE_MAPPING[kbType][0]);
  }, [kbType]);

  // Toggle KB Group
  const toggleKbGroup = (type: string) => {
    setExpandedKbGroups(prev => ({...prev, [type]: !prev[type]}));
  };

  // --- Filter Logic ---
  const filteredAppeals = appeals.filter(appeal => {
    const matchesSearch = 
      appeal.emailAccount.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appeal.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appeal.accountType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (appeal.id && appeal.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || appeal.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // --- CSV Export Logic ---
  const handleExportCSV = () => {
    if (filteredAppeals.length === 0) return;
    const headers = ['工单ID', '提交时间', '客户', '账号类型', '店铺邮箱', '邮箱密码', '登录信息', '状态', '扣费金额', '管理员备注'];
    const rows = filteredAppeals.map(a => [
      a.id, new Date(a.createdAt).toLocaleString(), a.username, a.accountType, a.emailAccount, a.emailPass, `"${a.loginInfo.replace(/"/g, '""')}"`, a.status, a.deductionAmount, `"${(a.adminNotes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `申诉记录导出_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEditClick = (appeal: Appeal) => {
    setEditingAppeal(appeal);
    setEditNote(appeal.adminNotes || '');
    setEditStatus(appeal.status as AppealStatus);
    setEditDeduction(appeal.deductionAmount || 0); 
    
    // Reset AI Writer
    setAiGeneratedText('');
    setAiStep(1);
    setAiRootCause('');
    setAiStoreName('');
    setAiPartnerId('');
    setAiCustomInstructions('');
    setAiTableExtract('');
    setAiMetricCurrent('');
    setAiMetricTarget('');
    setAiDate(new Date().toISOString().split('T')[0]);
    setRagReferences([]);
    setIsAnalyzingExcel(false);
    // Default to first type
    setAiPoaType(PoaType.ACCOUNT_SUSPENSION);
  };

  const handleUploadQr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast('正在上传收款码...', 'info');
    const { url, error } = await uploadPaymentQr(file);
    if (url) {
      setCurrentQrUrl(url);
      const { success, error: configError } = await saveSystemConfig({
        contactInfo, paymentQrUrl: url, marketingBaseCases, marketingSuccessRate, marketingBaseProcessing
      });
      if (success) showToast('收款码更新成功！', 'success');
      else showToast(`图片已上传，但配置保存失败: ${configError}`, 'error');
    } else {
       showToast(error || '上传失败', 'error');
    }
  };

  const handleSaveSystemConfig = async () => {
    setLoading(true);
    const { success, error } = await saveSystemConfig({ 
      contactInfo, paymentQrUrl: currentQrUrl, marketingBaseCases, marketingSuccessRate, marketingBaseProcessing
    });
    if (success) showToast('全局配置保存成功', 'success');
    else showToast(error || '保存失败', 'error');
    setLoading(false);
  };

  // --- Fix: Handle AI Studio Key Selection safely without global type conflict ---
  const handleOpenKeyDialog = async () => {
    try {
      // Use type assertion to bypass potential global declaration merge conflicts
      await (window as any).aistudio?.openSelectKey();
      showToast('API 密钥已更新', 'success');
    } catch (err) {
      showToast('打开密钥选择器失败', 'error');
    }
  };

  // --- Excel Parsing Logic (Multi-Sheet Support) ---
  const handleAnalyzeExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingExcel(true);
    showToast('正在分析 Excel 全部分表数据...', 'info');

    try {
       // 1. Backend Sync: Upload file to storage (archiving purpose)
       const uploadedUrl = await uploadAppealEvidence(file);
       if (!uploadedUrl) {
          console.warn('Backend upload failed, but proceeding with local analysis.');
       }

       // 2. Client-side Analysis
       const reader = new FileReader();
       reader.onload = (evt) => {
         try {
            const bstr = evt.target?.result;
            const workbook = XLSX.read(bstr, { type: 'array' });
            
            let allSheetsData = "";
            let processedCount = 0;

            // --- KEY FIX: Loop through ALL SheetNames ---
            workbook.SheetNames.forEach(sheetName => {
               const worksheet = workbook.Sheets[sheetName];
               // Convert to CSV
               const csvData = XLSX.utils.sheet_to_csv(worksheet);
               
               // Only extract if the sheet has content
               if (csvData && csvData.trim().length > 0) {
                 // Add clear delimiter for AI to recognize tabs
                 allSheetsData += `\n\n====== TAB/SHEET: "${sheetName}" ======\n${csvData}`;
                 processedCount++;
               }
            });
            
            // Truncate if too huge (Gemini context is large but let's limit to safe chars)
            const truncatedData = allSheetsData.substring(0, 25000);
            
            if (processedCount === 0) {
               showToast('Excel 文件似乎为空', 'error');
            } else {
               setAiTableExtract(truncatedData);
               showToast(`成功解析 ${processedCount} 个工作表！数据已合并填充。`, 'success');
               if(uploadedUrl) showToast('文件已同步备份至后端云存储。', 'success');
            }
         } catch (err) {
            console.error(err);
            showToast('Excel 解析失败，请检查文件格式', 'error');
         } finally {
            setIsAnalyzingExcel(false);
         }
       };
       reader.readAsArrayBuffer(file);
       
    } catch (err: any) {
       console.error(err);
       showToast('处理失败: ' + err.message, 'error');
       setIsAnalyzingExcel(false);
    }
  };

  // --- V2: Smart POA Generation Logic ---
  const generateSmartPOA = async () => {
    setIsGeneratingPoa(true);
    setRagReferences([]);
    
    try {
      // Create a fresh instance for the latest API Key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // 1. Retrieval (RAG): Fetch similar successful cases
      const similarCases = await searchKnowledgeBase(aiPoaType, aiPoaSubType, 3);
      setRagReferences(similarCases.map(c => c.title)); // Capture references
      const examples = similarCases.map(c => `Example Case (${c.title}):\n${c.content}`).join('\n\n');

      if (similarCases.length > 0) {
         incrementKbUsage(similarCases);
      }

      // Generate Random Names for this session
      const staff = getRandomNames();

      // 2. Prompt Construction
      const isFulfillmentSuspension = aiPoaType === PoaType.FULFILLMENT_SUSPENSION;
      const isIpIssue = aiPoaSubType.includes('知识产权') || aiPoaSubType.includes('侵权') || aiPoaSubType.includes('IP');
      
      const todayStr = new Date().toISOString().split('T')[0];

      let systemInstruction = `You are a professional Walmart Appeal Specialist. Your task is to write a highly persuasive Plan of Action (POA).
      
      Structure:
      1. Intro (Apology, Store Name: ${aiStoreName}, PID: ${aiPartnerId})
      2. Root Cause (THE "5 WHYS" Deep Analysis)
      3. Immediate Actions (Completed actions from ${aiDate} to ${todayStr})
      4. Preventative Measures (Multi-tier Review Process)
      5. Implementation Plan (Future timeline & Personnel)
      6. Conclusion (Reinstatement request)
      
      CRITICAL WRITING RULES:
      1. ROOT CAUSE - THE "5 WHYS" METHOD & MULTI-TAB ANALYSIS: Describe data inline. Use phrases like "As seen in the 'Late Shipment' tab for Order 12345...".
      2. PREVENTATIVE MEASURES - MULTI-TIER REVIEW: Use provided personnel names naturally.
      3. QUANTIFIABLE GOALS: Compare ${aiMetricCurrent} vs ${aiMetricTarget}.
      4. STRICTLY FORBIDDEN: Phrases like "Please see attached file".
      
      PERSONNEL TO USE:
      - Operations Lead: ${staff.manager}
      - Warehouse Lead: ${staff.warehouse}
      - CS Supervisor: ${staff.cs}
      - Compliance Officer: ${staff.compliance}`;

      if (isFulfillmentSuspension) {
        systemInstruction += `\nConstraint: Fulfillment Suspension POA must be under 1000 chars.`;
      } else {
        systemInstruction += `\nConstraint: Account Suspension POA should be detailed (800-1500 words).`;
      }

      if (isIpIssue) {
         systemInstruction += `\nIP Focus: State infringing listings are deleted. Mention inventory audit, invoice verification & IP training.`;
      }
      
      if (aiCustomInstructions) {
         systemInstruction += `\n\nUSER OVERRIDE: ${aiCustomInstructions}`;
      }

      const userContext = `
      Type: ${aiPoaType} - ${aiPoaSubType}
      Store: ${aiStoreName} (PID: ${aiPartnerId})
      Suspension Date: ${aiDate}
      Root Cause Detail: ${aiRootCause}
      Table Data Extract: ${aiTableExtract || 'No specific table data provided.'}
      Current Metric: ${aiMetricCurrent || 'N/A'}
      Target Metric: ${aiMetricTarget || 'N/A'}`;

      const prompt = `${systemInstruction}\n\nReference Examples:\n${examples}\n\nNow write the POA based on the USER CONTEXT below:\n${userContext}`;

      let finalText = '';

      // --- ROBUST MODEL FALLBACK STRATEGY ---
      // Attempt 1: Gemini 3 Flash Preview (Optimized for text tasks)
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
          contents: prompt,
        });
        finalText = response.text || '';
      } catch (err: any) {
        console.warn('Gemini 3 Flash failed, attempting fallback to Gemini 3 Pro...', err);
        
        // Attempt 2: Gemini 3 Pro Preview (Higher reasoning capability)
        try {
           const fallbackResponse = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
          });
          finalText = fallbackResponse.text || '';
          showToast('已自动切换至 Pro 模型完成高精度生成。', 'info');
        } catch (fallbackErr: any) {
           throw fallbackErr; 
        }
      }

      if (!finalText) throw new Error('生成内容为空');

      setAiGeneratedText(finalText);
      setAiStep(2);

    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || '未知错误';
      if (errorMsg.includes('Requested entity was not found')) {
        showToast('API 密钥无效或不支持当前模型。请重新选择计费项目密钥。', 'error');
        await (window as any).aistudio?.openSelectKey();
      } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        errorMsg = 'API 额度已耗尽 (429)。请稍后再试或检查计费状态。';
        showToast(errorMsg, 'error');
      } else {
        showToast('AI生成失败: ' + errorMsg, 'error');
      }
    } finally {
      setIsGeneratingPoa(false);
    }
  };

  const handleDownloadDoc = () => {
    if (!aiGeneratedText) return;
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>";
    const footer = "</body></html>";
    let safeText = aiGeneratedText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    safeText = safeText.replace(/^\* (.*$)/gm, '• $1');
    const content = safeText.replace(/\n/g, '<br/>');
    const sourceHTML = header + `<div style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; white-space: pre-wrap;">${content}</div>` + footer;
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = `POA_${aiStoreName || 'Draft'}_${new Date().toISOString().slice(0,10)}.doc`;
    fileDownload.click();
    document.body.removeChild(fileDownload);
    showToast('文档下载已开始', 'success');
  };

  const handleSaveAppeal = async () => {
    if (!editingAppeal) return;
    setLoading(true);

    let statusDetailStr = undefined;
    if (editStatus === AppealStatus.FOLLOW_UP) {
      const now = new Date();
      statusDetailStr = `${now.getMonth() + 1}月${now.getDate()}日已跟进`;
    }

    if (editStatus === AppealStatus.PASSED && editingAppeal.status !== AppealStatus.PASSED && editDeduction > 0) {
      const tx: Transaction = {
        id: `deduct-${Date.now()}`,
        userId: editingAppeal.userId,
        username: editingAppeal.username,
        type: TransactionType.DEDUCTION,
        amount: editDeduction,
        status: TransactionStatus.APPROVED,
        note: `申诉通过扣费 (ID: ${editingAppeal.id})`,
        createdAt: new Date().toISOString()
      };
      await saveTransaction(tx);
      await updateUserBalance(editingAppeal.userId, -editDeduction);
    }

    const updatedAppeal: Appeal = {
      ...editingAppeal,
      status: editStatus,
      statusDetail: statusDetailStr,
      adminNotes: editNote,
      deductionAmount: editDeduction,
      updatedAt: new Date().toISOString()
    };

    await saveAppeal(updatedAppeal);
    showToast('工单更新成功', 'success');
    
    if (editStatus === AppealStatus.PASSED && aiGeneratedText && isSuperAdmin) {
      if (confirm("是否将此 POA 存入知识库以供后续学习？")) {
         await addToKnowledgeBase({
           id: `kb-${Date.now()}`,
           type: aiPoaType,
           subType: aiPoaSubType,
           title: `自动归档: ${editingAppeal.username}`,
           content: aiGeneratedText,
           createdAt: new Date().toISOString(),
           usageCount: 1
         });
         showToast('已收录', 'success');
      }
    }
    setEditingAppeal(null);
    setLoading(false);
  };

  const handleKbFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setKbFileUploading(true);
    setKbUploadLogs([]);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.endsWith('.docx')) continue;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.value) {
          const autoCat = autoClassifyPoa(file.name);
          await addToKnowledgeBase({
            id: `kb-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
            type: autoCat ? autoCat.type : kbType,
            subType: autoCat ? autoCat.subType : kbSubType,
            title: file.name.replace('.docx', ''),
            content: result.value,
            createdAt: new Date().toISOString(),
            usageCount: 0
          });
          setKbUploadLogs(prev => [...prev, `✅ 成功: ${file.name}`]);
        }
      } catch (err) {
        setKbUploadLogs(prev => [...prev, `❌ 错误: ${file.name}`]);
      }
    }
    setKbFileUploading(false);
    loadData();
  };

  const handleAddKbItem = async () => {
    if (!kbTitle || !kbContent) return showToast('标题和内容不能为空', 'error');
    await addToKnowledgeBase({
      id: `kb-${Date.now()}`,
      type: kbType,
      subType: kbSubType,
      title: kbTitle,
      content: kbContent,
      createdAt: new Date().toISOString(),
      usageCount: 0
    });
    showToast('已录入', 'success');
    setKbTitle(''); setKbContent(''); loadData();
  };

  const handleApproveRecharge = async (tx: Transaction) => {
    const updatedTx: Transaction = { ...tx, status: TransactionStatus.APPROVED };
    await saveTransaction(updatedTx);
    await updateUserBalance(tx.userId, tx.amount);
    showToast('已确认入账', 'success');
  };

  const handleRejectRecharge = async (tx: Transaction) => {
    const updatedTx: Transaction = { ...tx, status: TransactionStatus.REJECTED };
    await saveTransaction(updatedTx);
    showToast('已拒绝', 'info');
  };

  const renderAttachment = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return (
        <div onClick={() => setLightboxUrl(url)} className="mt-2 cursor-pointer group relative overflow-hidden rounded-lg border border-gray-200 w-full max-w-xs">
          <img src={url} alt="Evidence" className="w-full h-32 object-cover" />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center">
             <Eye className="text-white" size={24} />
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
        <FileText size={24} />
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-600 font-bold">下载附件.{ext}</a>
      </div>
    );
  };

  const pendingAppealsCount = appeals.filter(a => a.status === AppealStatus.PENDING).length;
  const pendingRechargeCount = transactions.filter(t => t.type === TransactionType.RECHARGE && t.status === TransactionStatus.PENDING).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
          <ShieldAlert size={14} /> {isSuperAdmin ? '超级管理员' : '管理员'}
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'appeals' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : ''}`}>
            工单 {pendingAppealsCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingAppealsCount}</span>}
          </button>
          <button onClick={() => setActiveTab('finance')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'finance' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : ''}`}>
            充值 {pendingRechargeCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRechargeCount}</span>}
          </button>
          {isSuperAdmin && <button onClick={() => setActiveTab('brain')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'brain' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : ''}`}>AI 智囊团</button>}
          <button onClick={() => setActiveTab('security')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'security' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : ''}`}>设置</button>
        </div>

        <div className="p-6">
          {activeTab === 'appeals' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">工单管理</h3>
                <input type="text" placeholder="搜邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border p-2 rounded text-sm" />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr><th className="p-3 text-left">客户</th><th className="p-3 text-left">账号</th><th className="p-3 text-left">状态</th><th className="p-3 text-left">操作</th></tr>
                  </thead>
                  <tbody>{filteredAppeals.map(a => <tr key={a.id} className="border-t">
                    <td className="p-3 text-sm">{a.username}</td>
                    <td className="p-3 text-sm">{a.emailAccount}</td>
                    <td className="p-3 text-sm"><span className="px-2 py-1 bg-gray-100 rounded text-xs">{a.status}</span></td>
                    <td className="p-3 text-sm"><button onClick={() => handleEditClick(a)} className="text-brand-600">处理</button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'finance' && (
             <div className="space-y-4">{transactions.filter(t => t.type === TransactionType.RECHARGE && t.status === TransactionStatus.PENDING).map(tx => (
                 <div key={tx.id} className="border border-blue-200 rounded-lg p-4 flex justify-between items-center bg-blue-50">
                    <div><p className="font-bold">{tx.username} 充值 ¥{tx.amount}</p></div>
                    <div className="flex gap-2"><button onClick={() => handleRejectRecharge(tx)} className="px-3 py-1 bg-white border rounded">拒绝</button><button onClick={() => handleApproveRecharge(tx)} className="px-3 py-1 bg-green-600 text-white rounded">确认</button></div>
                 </div>
               ))}</div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8">
              <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                <h4 className="font-bold text-indigo-900 flex items-center gap-2 mb-4"><Key size={20}/> API 功能配置</h4>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-indigo-800">
                    <p className="font-bold">API 密钥管理</p>
                    <p className="opacity-80">点击按钮选择支持 Gemini 3 模型的付费计费项目密钥。</p>
                  </div>
                  <button onClick={handleOpenKeyDialog} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2">
                    <Key size={18} /> 选择/更新 API 密钥
                  </button>
                </div>
                <div className="mt-4 pt-4 border-t border-indigo-200 text-xs text-indigo-500">
                  注意：请确保项目已绑定 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline font-bold">计费账户 (Billing Account)</a> 以获得稳定额度。
                </div>
              </div>
              <button onClick={handleSaveSystemConfig} className="px-6 py-2 bg-brand-600 text-white rounded">保存系统配置</button>
            </div>
          )}

          {activeTab === 'brain' && isSuperAdmin && (
            <div className="space-y-6">
              <div className="bg-indigo-600 text-white p-6 rounded-xl">
                 <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuit/> AI 智囊团</h2>
              </div>
              <div className="border p-6 rounded-xl bg-gray-50">
                 <h3 className="font-bold mb-4">录入新案例 (支持 Docx 批量)</h3>
                 <input type="file" multiple accept=".docx" onChange={handleKbFileUpload} className="mb-4" />
                 <textarea value={kbContent} onChange={e => setKbContent(e.target.value)} rows={4} className="w-full border p-2 mb-4" placeholder="粘贴内容..." />
                 <button onClick={handleAddKbItem} className="bg-indigo-600 text-white px-6 py-2 rounded">手动保存</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold">处理工单: {editingAppeal.emailAccount}</h3>
              <button onClick={() => setEditingAppeal(null)}><X size={24} /></button>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-1/3 p-6 bg-gray-50 border-r overflow-y-auto space-y-4">
                 <p className="text-sm"><b>类型:</b> {editingAppeal.accountType}</p>
                 <p className="text-sm"><b>密码:</b> {editingAppeal.emailPass}</p>
                 <div className="bg-white p-3 border rounded text-xs whitespace-pre-wrap">{editingAppeal.loginInfo}</div>
                 {editingAppeal.screenshot && renderAttachment(editingAppeal.screenshot)}
                 <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-2 rounded">
                   <option value={AppealStatus.PROCESSING}>处理中</option>
                   <option value={AppealStatus.PASSED}>申诉通过</option>
                   <option value={AppealStatus.REJECTED}>申诉驳回</option>
                 </select>
                 <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3} className="w-full border p-2 text-sm" placeholder="备注..." />
              </div>
              <div className="w-2/3 p-6 flex flex-col space-y-6">
                 <h4 className="font-bold text-indigo-700 flex items-center gap-2"><Sparkles/> 智能 POA 助手</h4>
                 {aiStep === 1 ? (
                   <div className="space-y-4 overflow-y-auto pr-2">
                     <div className="grid grid-cols-2 gap-4">
                       <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名" className="border p-2 rounded" />
                       <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="PID" className="border p-2 rounded" />
                     </div>
                     <div className="relative group">
                        <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={4} className="w-full border p-2 text-xs font-mono" placeholder="Excel 数据..." />
                        <div className="absolute top-2 right-2 flex gap-2">
                           <div className="relative bg-green-50 text-green-700 px-3 py-1 rounded text-xs font-bold border cursor-pointer">
                              {isAnalyzingExcel ? '分析中' : '上传 Excel 分析'}
                              <input type="file" accept=".xlsx,.xls" onChange={handleAnalyzeExcel} className="absolute inset-0 opacity-0 cursor-pointer" />
                           </div>
                        </div>
                     </div>
                     <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border p-2 text-sm" placeholder="原因分析..." />
                     <button onClick={generateSmartPOA} disabled={isGeneratingPoa} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                        {isGeneratingPoa ? <Loader2 className="animate-spin"/> : <Sparkles/>} 开始智能撰写
                     </button>
                   </div>
                 ) : (
                   <div className="flex-1 flex flex-col space-y-4 min-h-0">
                     <div className="flex-1 bg-gray-50 p-4 border rounded overflow-y-auto whitespace-pre-wrap font-mono text-xs">{aiGeneratedText}</div>
                     <div className="flex gap-2 shrink-0">
                        <button onClick={() => setAiStep(1)} className="px-4 py-2 border rounded">重新调整</button>
                        <button onClick={handleDownloadDoc} className="flex-1 bg-brand-600 text-white rounded font-bold">下载 Word 文档</button>
                     </div>
                   </div>
                 )}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
               <button onClick={() => setEditingAppeal(null)} className="px-6 py-2 border rounded">取消</button>
               <button onClick={handleSaveAppeal} disabled={loading} className="px-6 py-2 bg-brand-600 text-white rounded font-bold">保存更新</button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
         <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
            <img src={lightboxUrl} className="max-w-full max-h-full" alt="Large preview" />
         </div>
      )}
    </div>
  );
};
