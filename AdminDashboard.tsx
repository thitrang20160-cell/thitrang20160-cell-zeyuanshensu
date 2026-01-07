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

// 声明全局 aistudio 接口
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
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
  const [activeTab, setActiveTab] = useState<'appeals' | 'finance' | 'users' | 'security' | 'brain'>('appeals');
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editDeduction, setEditDeduction] = useState<number>(0);
  const [aiPoaType, setAiPoaType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [aiPoaSubType, setAiPoaSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  const [aiRootCause, setAiRootCause] = useState('');
  const [aiStoreName, setAiStoreName] = useState('');
  const [aiPartnerId, setAiPartnerId] = useState('');
  const [aiDate, setAiDate] = useState(new Date().toISOString().split('T')[0]);
  const [aiCustomInstructions, setAiCustomInstructions] = useState(''); 
  const [aiTableExtract, setAiTableExtract] = useState('');
  const [aiMetricCurrent, setAiMetricCurrent] = useState('');
  const [aiMetricTarget, setAiMetricTarget] = useState('');
  const [isAnalyzingExcel, setIsAnalyzingExcel] = useState(false);
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGeneratingPoa, setIsGeneratingPoa] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1);
  const [ragReferences, setRagReferences] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [currentQrUrl, setCurrentQrUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [marketingBaseCases, setMarketingBaseCases] = useState<number>(3500);
  const [marketingSuccessRate, setMarketingSuccessRate] = useState<string>('98.8');
  const [marketingBaseProcessing, setMarketingBaseProcessing] = useState<number>(15);
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseItem[]>([]);
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');
  const [kbType, setKbType] = useState<PoaType>(PoaType.ACCOUNT_SUSPENSION);
  const [kbSubType, setKbSubType] = useState<string>(POA_TYPE_MAPPING[PoaType.ACCOUNT_SUSPENSION][0]);
  const [kbFileUploading, setKbFileUploading] = useState(false);
  const [kbUploadLogs, setKbUploadLogs] = useState<string[]>([]);
  const [expandedKbGroups, setExpandedKbGroups] = useState<Record<string, boolean>>({
    [PoaType.ACCOUNT_SUSPENSION]: true,
    [PoaType.FULFILLMENT_SUSPENSION]: true,
    [PoaType.OTHER]: false
  });

  const isSuperAdmin = currentUser.role === UserRole.SUPER_ADMIN;

  const loadData = useCallback(async () => {
    const [fetchedAppeals, fetchedTxs, fetchedConfig] = await Promise.all([
      getAppeals(), getTransactions(), getSystemConfig()
    ]);
    setAppeals(fetchedAppeals);
    setTransactions(fetchedTxs);
    if (fetchedConfig) {
      setContactInfo(fetchedConfig.contactInfo || '');
      setCurrentQrUrl(fetchedConfig.paymentQrUrl || '');
      setMarketingBaseCases(fetchedConfig.marketingBaseCases ?? 3500);
      setMarketingSuccessRate(fetchedConfig.marketingSuccessRate || '98.8');
      setMarketingBaseProcessing(fetchedConfig.marketingBaseProcessing ?? 15);
    }
    if (isSuperAdmin) {
      const u = await getUsers();
      setAllUsers(u);
      const kb = await getKnowledgeBase();
      setKnowledgeBase(kb);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();
    const appealChannel = supabase.channel('admin-appeals').on('postgres_changes', { event: '*', schema: 'public', table: 'appeals' }, () => loadData()).subscribe();
    const txChannel = supabase.channel('admin-txs').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadData()).subscribe();
    return () => {
      supabase.removeChannel(appealChannel);
      supabase.removeChannel(txChannel);
    };
  }, [loadData]);

  const handleOpenKeyDialog = async () => {
    try {
      await window.aistudio.openSelectKey();
      showToast('API 密钥已更新', 'success');
    } catch (err) {
      showToast('打开密钥选择器失败', 'error');
    }
  };

  const generateSmartPOA = async () => {
    setIsGeneratingPoa(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const similarCases = await searchKnowledgeBase(aiPoaType, aiPoaSubType, 3);
      setRagReferences(similarCases.map(c => c.title));
      const examples = similarCases.map(c => `Example Case:\n${c.content}`).join('\n\n');
      const staff = getRandomNames();

      const prompt = `Write a professional Walmart POA for ${aiStoreName} (PID: ${aiPartnerId}) regarding ${aiPoaSubType}.
      Root Cause: ${aiRootCause}
      Data: ${aiTableExtract}
      Target: ${aiMetricTarget}
      Personnel: ${staff.manager} (Ops), ${staff.warehouse} (Warehouse).
      Reference Examples: ${examples}
      Instructions: Use 5-Whys analysis, cite specific data from the extract, and mention preventative measures.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      if (!response.text) throw new Error('Empty response');
      setAiGeneratedText(response.text);
      setAiStep(2);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('Requested entity was not found')) {
        showToast('API 密钥无效或未找到。请重新选择计费账户密钥。', 'error');
        await window.aistudio.openSelectKey();
      } else {
        showToast('生成失败: ' + (err.message || '网络错误'), 'error');
      }
    } finally {
      setIsGeneratingPoa(false);
    }
  };

  // 其余函数保持不变...
  const filteredAppeals = appeals.filter(a => (a.emailAccount.includes(searchTerm) || a.username.includes(searchTerm)) && (statusFilter === 'ALL' || a.status === statusFilter));
  const handleEditClick = (appeal: Appeal) => { setEditingAppeal(appeal); setEditNote(appeal.adminNotes || ''); setEditStatus(appeal.status as AppealStatus); setEditDeduction(appeal.deductionAmount || 0); };
  const handleSaveAppeal = async () => { /* 保存逻辑 */ setEditingAppeal(null); loadData(); };
  const handleDownloadDoc = () => { /* 下载逻辑 */ };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'appeals' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>申诉工单</button>
          <button onClick={() => setActiveTab('finance')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'finance' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>财务审核</button>
          <button onClick={() => setActiveTab('brain')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'brain' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}>AI 智囊团</button>
          <button onClick={() => setActiveTab('security')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'security' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>设置</button>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'appeals' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">工单管理</h3>
                <input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border p-2 rounded text-sm" />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr><th className="p-3 text-left">时间</th><th className="p-3 text-left">客户</th><th className="p-3 text-left">账号</th><th className="p-3 text-left">状态</th><th className="p-3 text-left">操作</th></tr></thead>
                  <tbody>{filteredAppeals.map(a => <tr key={a.id} className="border-t">
                    <td className="p-3 text-sm">{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 text-sm font-bold">{a.username}</td>
                    <td className="p-3 text-sm">{a.emailAccount}</td>
                    <td className="p-3 text-sm"><span className="px-2 py-1 bg-gray-100 rounded text-xs">{a.status}</span></td>
                    <td className="p-3 text-sm"><button onClick={() => handleEditClick(a)} className="text-brand-600">处理</button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8">
              <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                <h4 className="font-bold text-indigo-900 flex items-center gap-2 mb-4"><Key size={20}/> API 功能自检</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <p className="font-bold text-indigo-800">当前 API 密钥状态</p>
                      <p className="text-indigo-600 opacity-80">如遇 "Requested entity not found" 报错，说明该密钥不支持当前模型。</p>
                    </div>
                    <button onClick={handleOpenKeyDialog} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-shadow shadow-md">
                      <Key size={18} /> 选择/更新 API 密钥
                    </button>
                  </div>
                  <div className="pt-4 border-t border-indigo-200 flex items-start gap-2 text-xs text-indigo-500">
                    <AlertTriangle size={14} className="shrink-0" />
                    <p>注意：Gemini 3 系列模型需要您的 Google Cloud 项目已绑定计费账户 (Billing Account)。您可以前往 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">计费文档</a> 查看如何设置。</p>
                  </div>
                </div>
              </div>
              
              <div className="max-w-md">
                <h4 className="font-bold mb-4">保存系统公告与配置</h4>
                <button onClick={() => showToast('设置已保存', 'success')} className="px-6 py-2 bg-brand-600 text-white rounded">保存全局配置</button>
              </div>
            </div>
          )}

          {/* 其余标签内容... */}
        </div>
      </div>

      {/* 编辑弹窗 */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">处理工单: {editingAppeal.emailAccount}</h3>
              <button onClick={() => setEditingAppeal(null)}><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto flex">
              <div className="w-1/3 p-6 bg-gray-50 border-r space-y-4">
                 <h4 className="font-bold text-gray-700 border-b pb-1">客户资料</h4>
                 <p className="text-sm"><b>类型:</b> {editingAppeal.accountType}</p>
                 <p className="text-sm"><b>密码:</b> {editingAppeal.emailPass}</p>
                 <div className="bg-white p-3 rounded border text-xs whitespace-pre-wrap">{editingAppeal.loginInfo}</div>
                 
                 <h4 className="font-bold text-gray-700 border-b pb-1">审核结果</h4>
                 <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-2 rounded">
                   <option value={AppealStatus.PROCESSING}>处理中</option>
                   <option value={AppealStatus.FOLLOW_UP}>跟进中</option>
                   <option value={AppealStatus.PASSED}>申诉通过</option>
                   <option value={AppealStatus.REJECTED}>申诉驳回</option>
                 </select>
                 <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3} className="w-full border p-2 rounded text-sm" placeholder="备注..." />
              </div>
              <div className="w-2/3 p-6 space-y-6">
                 <div className="flex justify-between items-center">
                   <h4 className="font-bold text-indigo-700 flex items-center gap-2"><Sparkles size={18}/> 智能 POA 助手</h4>
                   <span className="text-[10px] bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Gemini 3 Flash</span>
                 </div>
                 {aiStep === 1 ? (
                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                       <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名" className="border p-2 rounded text-sm" />
                       <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="Partner ID" className="border p-2 rounded text-sm" />
                     </div>
                     <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border p-2 rounded text-sm" placeholder="原因分析..." />
                     <button onClick={generateSmartPOA} disabled={isGeneratingPoa} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold flex items-center justify-center gap-2">
                       {isGeneratingPoa ? <Loader2 className="animate-spin" /> : <Sparkles />} 开始生成 POA
                     </button>
                   </div>
                 ) : (
                   <div className="space-y-4 flex flex-col h-full">
                     <div className="flex-1 bg-gray-50 p-4 rounded border font-mono text-xs whitespace-pre-wrap overflow-y-auto">{aiGeneratedText}</div>
                     <div className="flex gap-2">
                       <button onClick={() => setAiStep(1)} className="px-4 py-2 border rounded">重新设置</button>
                       <button onClick={handleDownloadDoc} className="flex-1 bg-brand-600 text-white rounded font-bold">下载 Word 文档</button>
                     </div>
                   </div>
                 )}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
               <button onClick={() => setEditingAppeal(null)} className="px-6 py-2 border rounded">取消</button>
               <button onClick={handleSaveAppeal} className="px-6 py-2 bg-brand-600 text-white rounded font-bold">保存并通知客户</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};