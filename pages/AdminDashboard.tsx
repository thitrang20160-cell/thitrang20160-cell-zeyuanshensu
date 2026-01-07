
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, KnowledgeBaseItem, PoaType, POA_TYPE_MAPPING } from '../types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, updateUserBalance, changePassword, supabase, uploadPaymentQr, getUsers, saveSystemConfig, getSystemConfig, updateAnyUser, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase, searchKnowledgeBase, incrementKbUsage, uploadAppealEvidence } from '../services/storageService';
import { 
  CheckCircle, XCircle, Clock, Search, Edit3, DollarSign, 
  BrainCircuit, Save, X, Filter, Loader2, Bell,
  FileText, FileSpreadsheet, Download, File, QrCode, Upload, Users, ShieldAlert, Settings, AlertTriangle, TrendingUp, RefreshCw, Eye, Sparkles, BookOpen, Trash2, Copy, FilePlus, Link, Github, Terminal, ListChecks, Calendar, Store, Hash, ChevronDown, ChevronRight, Layers, MessageSquarePlus, Table, Database, ExternalLink, Key, CreditCard
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { useToast } from '../components/Toast';

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
  const [aiTableExtract, setAiTableExtract] = useState('');
  const [aiMetricTarget, setAiMetricTarget] = useState('');
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGeneratingPoa, setIsGeneratingPoa] = useState(false);
  const [aiStep, setAiStep] = useState<1 | 2>(1);
  const [currentQrUrl, setCurrentQrUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');

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
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenKeyDialog = async () => {
    try {
      await (window as any).aistudio?.openSelectKey();
      showToast('密钥选择窗口已打开', 'info');
    } catch (err) {
      showToast('无法打开密钥选择器', 'error');
    }
  };

  const generateSmartPOA = async () => {
    setIsGeneratingPoa(true);
    try {
      // 每次调用都实例化以确保获取最新的 API_KEY
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();

      const prompt = `你是一位专业的沃尔玛申诉专家。请为店铺 ${aiStoreName} (PID: ${aiPartnerId}) 撰写一份关于 ${aiPoaSubType} 的申诉信 (POA)。
      根本原因: ${aiRootCause}
      相关数据: ${aiTableExtract}
      改进目标: ${aiMetricTarget}
      负责人: 运营总监 ${staff.manager}, 仓库主管 ${staff.warehouse}。
      要求：使用 5-Whys 分析法，语言极具说服力，引用具体数据，并详细说明预防措施。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      if (!response.text) throw new Error('API 返回内容为空');
      setAiGeneratedText(response.text);
      setAiStep(2);
      showToast('POA 已由 Gemini 3 生成', 'success');
    } catch (err: any) {
      console.error('AI Error:', err);
      const errorMsg = err.message || '';
      
      if (errorMsg.includes('402') || errorMsg.includes('billing') || errorMsg.includes('Pay-as-you-go')) {
        showToast('API 计费未激活：请在 AI Studio 中点击“激活结算”并关联结算账号。', 'error');
      } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        showToast('配额超限：请检查 API 额度或切换至付费层级。', 'error');
      } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        showToast('模型未找到：当前 API 密钥可能不支持 gemini-3 模型。', 'error');
      } else {
        showToast('生成失败: ' + errorMsg, 'error');
      }
    } finally {
      setIsGeneratingPoa(false);
    }
  };

  const handleSaveAppeal = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    const updatedAppeal: Appeal = {
      ...editingAppeal,
      status: editStatus,
      adminNotes: editNote,
      deductionAmount: editDeduction,
      updatedAt: new Date().toISOString()
    };
    await saveAppeal(updatedAppeal);
    showToast('工单已保存', 'success');
    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  const filteredAppeals = appeals.filter(a => 
    (a.emailAccount.toLowerCase().includes(searchTerm.toLowerCase()) || a.username.toLowerCase().includes(searchTerm.toLowerCase())) && 
    (statusFilter === 'ALL' || a.status === statusFilter)
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('appeals')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'appeals' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>申诉工单</button>
          <button onClick={() => setActiveTab('finance')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'finance' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>充值审核</button>
          <button onClick={() => setActiveTab('security')} className={`flex-1 py-4 text-center font-medium ${activeTab === 'security' ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>系统设置</button>
        </div>

        <div className="p-6">
          {activeTab === 'appeals' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4">
                  <input type="text" placeholder="搜索客户或邮箱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border p-2 rounded text-sm w-64" />
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border p-2 rounded text-sm">
                    <option value="ALL">全部状态</option>
                    {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-medium">
                    <tr><th className="p-4 text-left">提交日期</th><th className="p-4 text-left">客户</th><th className="p-4 text-left">店铺邮箱</th><th className="p-4 text-left">状态</th><th className="p-4 text-right">操作</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredAppeals.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="p-4 text-sm">{new Date(a.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 text-sm font-bold">{a.username}</td>
                        <td className="p-4 text-sm text-gray-600">{a.emailAccount}</td>
                        <td className="p-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${a.status === AppealStatus.PASSED ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{a.status}</span>
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => { setEditingAppeal(a); setEditNote(a.adminNotes); setEditStatus(a.status as AppealStatus); setEditDeduction(a.deductionAmount); }} className="text-brand-600 hover:underline font-medium">处理工单</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="max-w-3xl space-y-8">
              <div className="bg-orange-50 p-6 rounded-xl border border-orange-100">
                <h4 className="font-bold text-orange-900 flex items-center gap-2 mb-4"><AlertTriangle size={20}/> AI 计费与额度自检指南</h4>
                <div className="space-y-4 text-sm text-orange-800">
                  <p className="font-bold">您的 API 调用失败通常是因为以下原因之一：</p>
                  <ul className="list-disc ml-5 space-y-2">
                    <li><b>未激活结算 (Billing)</b>：即使 Google Cloud 有卡，您也必须在 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold">AI Studio 密钥页面</a> 点击对应的 API Key 旁边的 <b>“激活结算 (Activate Billing)”</b> 链接。</li>
                    <li><b>配额受限</b>：免费层级对 Gemini 3 模型限制极严，建议升级为 <b>Pay-as-you-go</b> 层级。</li>
                    <li><b>项目不匹配</b>：请确保您在下方选中的密钥，就是您在 Google Cloud 中绑定了银行卡的那一个项目。</li>
                  </ul>
                  <div className="pt-4 flex gap-4">
                    <button onClick={handleOpenKeyDialog} className="px-6 py-2 bg-brand-600 text-white rounded-lg font-bold flex items-center gap-2 shadow-md">
                      <Key size={18} /> 重新选择 API 密钥
                    </button>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" className="px-6 py-2 bg-white border border-orange-200 text-orange-700 rounded-lg font-bold flex items-center gap-2">
                      <ExternalLink size={18} /> 前往 AI Studio 激活结算
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                <div className="p-5 border rounded-xl space-y-4">
                  <h4 className="font-bold flex items-center gap-2"><Settings size={18}/> 申诉费用设置</h4>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">默认申诉扣费 (元)</label>
                    <input type="number" defaultValue={200} className="w-full border p-2 rounded" />
                  </div>
                </div>
                <div className="p-5 border rounded-xl space-y-4">
                  <h4 className="font-bold flex items-center gap-2"><CreditCard size={18}/> 财务配置</h4>
                  <button onClick={() => showToast('设置已保存', 'success')} className="w-full py-2 bg-gray-800 text-white rounded font-bold">保存所有配置</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">正在处理：{editingAppeal.emailAccount}</h3>
              <button onClick={() => setEditingAppeal(null)} className="p-1 hover:bg-gray-200 rounded-full"><X size={24} /></button>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-1/3 p-6 bg-gray-50 border-r overflow-y-auto space-y-6">
                 <div>
                   <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">客户原始资料</h4>
                   <div className="space-y-2 text-sm">
                     <p><b>环境类型:</b> {editingAppeal.accountType}</p>
                     <p><b>邮箱密码:</b> <code className="bg-gray-100 px-1 rounded">{editingAppeal.emailPass}</code></p>
                     <p className="font-bold">登录详情:</p>
                     <div className="bg-white p-3 border rounded text-xs whitespace-pre-wrap font-mono">{editingAppeal.loginInfo}</div>
                   </div>
                 </div>
                 
                 <div className="pt-4 border-t">
                   <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">审核状态</h4>
                   <div className="space-y-4">
                     <select value={editStatus} onChange={e => setEditStatus(e.target.value as AppealStatus)} className="w-full border p-2 rounded font-bold">
                       {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                     <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={4} className="w-full border p-2 text-sm rounded" placeholder="管理员回复/备注..." />
                     <div>
                       <label className="block text-xs text-gray-500 mb-1">通过扣费金额 (¥)</label>
                       <input type="number" value={editDeduction} onChange={e => setEditDeduction(Number(e.target.value))} className="w-full border p-2 rounded text-red-600 font-bold" />
                     </div>
                   </div>
                 </div>
              </div>

              <div className="w-2/3 p-6 flex flex-col space-y-4">
                 <div className="flex justify-between items-center">
                   <h4 className="font-bold text-indigo-700 flex items-center gap-2"><Sparkles/> Gemini 3 智能 POA 助手</h4>
                   <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 font-bold uppercase tracking-widest">Advanced Preview</span>
                 </div>
                 
                 {aiStep === 1 ? (
                   <div className="space-y-4 overflow-y-auto pr-2">
                     <div className="grid grid-cols-2 gap-4">
                        <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名称" className="border p-2 rounded text-sm" />
                        <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="Partner ID" className="border p-2 rounded text-sm" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="border p-2 rounded text-sm">
                           {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="border p-2 rounded text-sm">
                           {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                     </div>
                     <textarea value={aiRootCause} onChange={e => setAiRootCause(e.target.value)} rows={3} className="w-full border p-2 rounded text-sm" placeholder="导致暂停的详细原因..." />
                     <textarea value={aiTableExtract} onChange={e => setAiTableExtract(e.target.value)} rows={4} className="w-full border p-2 rounded text-xs font-mono bg-gray-50" placeholder="在此粘贴 Excel 原始数据 (如绩效表格)..." />
                     <button onClick={generateSmartPOA} disabled={isGeneratingPoa} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                        {isGeneratingPoa ? <Loader2 className="animate-spin" /> : <Sparkles />} 立即利用 Gemini 3 撰写专业 POA
                     </button>
                   </div>
                 ) : (
                   <div className="flex-1 flex flex-col space-y-4 min-h-0">
                     <div className="flex-1 bg-gray-50 p-5 border rounded-xl overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800">{aiGeneratedText}</div>
                     <div className="flex gap-3 pt-2">
                        <button onClick={() => setAiStep(1)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">重新调整参数</button>
                        <button onClick={() => {
                          const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `POA_${aiStoreName}_${new Date().toISOString().slice(0,10)}.txt`;
                          a.click();
                        }} className="flex-1 bg-brand-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-brand-700">
                          <Download size={18} /> 下载申诉文书 (.txt)
                        </button>
                     </div>
                   </div>
                 )}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
               <button onClick={() => setEditingAppeal(null)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">取消</button>
               <button onClick={handleSaveAppeal} disabled={loading} className="px-8 py-2 bg-brand-600 text-white rounded-lg font-bold shadow-md hover:bg-brand-700 disabled:bg-gray-400">
                 {loading ? '正在保存...' : '完成处理并通知客户'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
