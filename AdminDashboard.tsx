
import React, { useState, useEffect, useCallback } from 'react';
import { User, Appeal, Transaction, AppealStatus, TransactionType, TransactionStatus, UserRole, PoaType, POA_TYPE_MAPPING, SystemConfig, KnowledgeBaseItem } from './types';
import { getAppeals, saveAppeal, getTransactions, saveTransaction, getUsers, getSystemConfig, saveSystemConfig, processDeductionAndCommission, getKnowledgeBase, addToKnowledgeBase, deleteFromKnowledgeBase } from './services/storageService';
import { 
  CheckCircle, XCircle, Search, Edit3, DollarSign, 
  Save, X, Loader2, Bell, Download, Users, 
  ShieldAlert, TrendingUp, Sparkles, 
  Key, PieChart, RefreshCw, Zap,
  ListChecks, BookOpen, Trash2, FileSpreadsheet, Plus, Activity
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
  
  // 角色判定
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isStaff = currentUser.role === UserRole.ADMIN;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const isMarketing = currentUser.role === UserRole.MARKETING;

  // 状态管理
  const [activeTab, setActiveTab] = useState<string>('appeals');
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [kbItems, setKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // AI 申诉相关状态
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

  // 工单处理状态
  const [editStatus, setEditStatus] = useState<AppealStatus>(AppealStatus.PENDING);
  const [editNote, setEditNote] = useState('');
  const [editDeduction, setEditDeduction] = useState(200);

  // 数据加载
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t, u, c, k] = await Promise.all([
        getAppeals(), 
        getTransactions(), 
        getUsers(), 
        getSystemConfig(), 
        getKnowledgeBase()
      ]);
      setAppeals(a);
      setTransactions(t);
      setAllUsers(u);
      setConfig(c);
      setKbItems(k);
    } catch (e) {
      console.error(e);
      showToast('数据加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // 初始化与 Tab 自动跳转
  useEffect(() => {
    loadData();
    // 关键修复：防止非老板角色进入默认 tab 导致白屏
    if (isMarketing) {
      setActiveTab('marketing_performance');
    } else if (isFinance) {
      setActiveTab('finance_review');
    } else if (isStaff) {
      setActiveTab('appeals');
    } else {
      // 老板默认看申诉
      setActiveTab('appeals');
    }
  }, [loadData, isMarketing, isFinance, isStaff]);

  // Excel 解析逻辑
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
        // 将表格转换为 CSV 格式的文本，方便 AI 理解
        const data = XLSX.utils.sheet_to_csv(ws);
        setAiTableExtract(data);
        showToast('Excel 数据提取成功，已注入 AI 上下文', 'success');
      } catch (err) {
        showToast('Excel 解析失败，请确认文件格式', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // AI 生成逻辑
  const handleGeneratePOA = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const staff = getRandomNames();
      
      const prompt = `
        角色: 资深沃尔玛申诉专家
        任务: 为店铺 "${aiStoreName}" (Partner ID: ${aiPartnerId}) 撰写一份专业的行动计划书 (POA)。
        违规类型: ${aiPoaSubType}
        
        核心绩效数据 (来自 Excel):
        ${aiTableExtract}
        
        根本原因分析:
        ${aiRootCause}
        
        改进措施负责人:
        - 运营经理: ${staff.manager}
        - 仓库主管: ${staff.warehouse}
        
        要求:
        1. 使用纯英文撰写，语气诚恳专业。
        2. 严格遵循 5-Whys 分析法。
        3. 针对提供的绩效数据进行具体分析，解释为何未达标。
        4. 列出详细的短期修正措施和长期预防措施。
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      
      if (response.text) {
        setAiGeneratedText(response.text);
        setAiStep(2);
        showToast('AI POA 生成成功', 'success');
      } else {
        throw new Error('未生成文本');
      }
    } catch (err: any) {
      console.error(err);
      showToast('生成失败，请检查 API Key 是否有效', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // 保存工单逻辑
  const handleSaveAppealTask = async () => {
    if (!editingAppeal) return;
    setLoading(true);
    
    let finalStatus = editStatus;
    // 如果是员工权限，且选择了"通过"，状态强制转为"待扣费"，需财务/老板二次确认
    if (isStaff && editStatus === AppealStatus.PASSED) {
      finalStatus = AppealStatus.PASSED_PENDING_DEDUCTION;
    }
    
    // 1. 更新工单
    await saveAppeal({ 
      ...editingAppeal, 
      status: finalStatus, 
      adminNotes: editNote, 
      deductionAmount: editDeduction, 
      updatedAt: new Date().toISOString() 
    });
    
    // 2. 如果状态是"待扣费"或"已通过"，且有扣费金额，创建扣费流水
    if ((finalStatus === AppealStatus.PASSED_PENDING_DEDUCTION || finalStatus === AppealStatus.PASSED) && editDeduction > 0) {
       // 检查是否已存在同名扣费单防止重复（简化逻辑：此处每次都生成新单，实际应更严谨）
       await saveTransaction({ 
        id: `deduct-${Date.now()}`, 
        userId: editingAppeal.userId, 
        username: editingAppeal.username, 
        type: TransactionType.DEDUCTION, 
        amount: editDeduction, 
        status: isStaff ? TransactionStatus.PENDING : TransactionStatus.APPROVED, // 老板直接通过，员工需审核
        appealId: editingAppeal.id, 
        note: `工单 ${editingAppeal.id.slice(-6)} 服务费`, 
        createdAt: new Date().toISOString() 
      });
      
      if (isStaff) showToast('已提交财务审核扣费', 'info');
      else showToast('工单处理完成并已直接扣费', 'success');
    } else {
      showToast('工单状态已更新', 'success');
    }
    
    setEditingAppeal(null);
    loadData();
    setLoading(false);
  };

  // API Key 设置
  const handleOpenKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
      } else {
        showToast('环境不支持 API Key 选择器', 'error');
      }
    } catch (e) {
      showToast('打开密钥设置失败', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部导航栏：根据角色动态显示 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar">
          {/* 老板 & 员工 */}
          {(isSuper || isStaff) && (
            <button 
              onClick={() => setActiveTab('appeals')} 
              className={`flex-1 py-4 px-6 text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'appeals' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              工单处理中心
            </button>
          )}
          
          {/* 老板 & 财务 */}
          {(isSuper || isFinance) && (
            <button 
              onClick={() => setActiveTab('finance_review')} 
              className={`flex-1 py-4 px-6 text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'finance_review' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              财务审核
            </button>
          )}
          
          {/* 仅老板 */}
          {isSuper && (
            <button 
              onClick={() => setActiveTab('knowledge_base')} 
              className={`flex-1 py-4 px-6 text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'knowledge_base' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              智囊团 (KB)
            </button>
          )}
          
          {/* 老板 & 营销 */}
          {(isSuper || isMarketing) && (
            <button 
              onClick={() => setActiveTab('marketing_performance')} 
              className={`flex-1 py-4 px-6 text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'marketing_performance' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              营销业绩
            </button>
          )}
          
          {/* 仅老板 */}
          {isSuper && (
            <>
              <button 
                onClick={() => setActiveTab('user_management')} 
                className={`flex-1 py-4 px-6 text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'user_management' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                员工管理
              </button>
              <button 
                onClick={() => setActiveTab('system_config')} 
                className={`flex-1 py-4 px-6 text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'system_config' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                全局配置
              </button>
            </>
          )}
        </div>

        <div className="p-6">
          {/* 1. 工单处理 Tab */}
          {activeTab === 'appeals' && (
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><ListChecks className="text-indigo-600"/> 申诉任务列表</h3>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                   <input 
                     value={searchTerm} 
                     onChange={e => setSearchTerm(e.target.value)} 
                     placeholder="搜索邮箱/客户..." 
                     className="pl-10 pr-4 py-2 border rounded-xl text-sm w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
                   />
                 </div>
               </div>
               <div className="overflow-x-auto border rounded-xl">
                 <table className="min-w-full divide-y divide-gray-100">
                   <thead className="bg-gray-50">
                     <tr>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">提交时间</th>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">客户</th>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">店铺邮箱</th>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">状态</th>
                       <th className="p-4 text-right text-xs font-bold text-gray-400">操作</th>
                     </tr>
                   </thead>
                   <tbody className="bg-white divide-y divide-gray-50">
                     {appeals.filter(a => a.emailAccount.includes(searchTerm) || a.username.includes(searchTerm)).map(a => (
                       <tr key={a.id} className="hover:bg-indigo-50/30">
                         <td className="p-4 text-sm text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                         <td className="p-4 text-sm font-bold">{a.username}</td>
                         <td className="p-4 text-sm font-mono text-gray-600">{a.emailAccount}</td>
                         <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold text-gray-600">{a.status}</span></td>
                         <td className="p-4 text-right">
                           <button 
                             onClick={() => {
                               setEditingAppeal(a);
                               setEditStatus(a.status);
                               setEditNote(a.adminNotes);
                               setEditDeduction(a.deductionAmount || 200);
                             }} 
                             className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                           >
                             处理
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* 2. 财务审核 Tab */}
          {activeTab === 'finance_review' && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><DollarSign className="text-green-600"/> 待处理财务请求</h3>
              <div className="overflow-x-auto border rounded-xl">
                <table className="min-w-full divide-y divide-gray-100">
                   <thead className="bg-gray-50">
                     <tr>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">申请人</th>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">类型</th>
                       <th className="p-4 text-left text-xs font-bold text-gray-400">金额</th>
                       <th className="p-4 text-right text-xs font-bold text-gray-400">审批</th>
                     </tr>
                   </thead>
                   <tbody className="bg-white divide-y divide-gray-50">
                     {transactions.filter(t => t.status === TransactionStatus.PENDING).map(t => (
                       <tr key={t.id}>
                         <td className="p-4 text-sm font-bold">{t.username}</td>
                         <td className="p-4 text-sm">{t.type}</td>
                         <td className="p-4 text-sm font-bold">¥{t.amount}</td>
                         <td className="p-4 text-right space-x-2">
                           <button 
                             onClick={() => processDeductionAndCommission(t.id).then(() => { showToast('已通过并记账', 'success'); loadData(); })}
                             className="px-3 py-1 bg-green-500 text-white rounded text-xs font-bold"
                           >
                             通过
                           </button>
                           <button 
                             onClick={() => saveTransaction({...t, status: TransactionStatus.REJECTED}).then(loadData)}
                             className="px-3 py-1 border border-red-200 text-red-500 rounded text-xs font-bold"
                           >
                             驳回
                           </button>
                         </td>
                       </tr>
                     ))}
                     {transactions.filter(t => t.status === TransactionStatus.PENDING).length === 0 && (
                       <tr><td colSpan={4} className="p-8 text-center text-gray-400 text-sm">暂无待审核交易</td></tr>
                     )}
                   </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. 智囊团 Tab */}
          {activeTab === 'knowledge_base' && isSuper && (
             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><BookOpen className="text-indigo-600"/> 知识库管理</h3>
                  <button className="flex items-center gap-1 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold"><Plus size={14}/> 新增</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {kbItems.map(item => (
                    <div key={item.id} className="p-4 border rounded-xl hover:shadow-md transition-shadow relative group">
                      <h4 className="font-bold text-sm mb-2">{item.title}</h4>
                      <p className="text-xs text-gray-500 line-clamp-2">{item.content}</p>
                      <button 
                        onClick={() => deleteFromKnowledgeBase(item.id).then(loadData)}
                        className="absolute top-2 right-2 text-gray-300 hover:text-red-500 hidden group-hover:block"
                      >
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {/* 4. 营销业绩 Tab */}
          {activeTab === 'marketing_performance' && (
             <div className="space-y-6">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
                   <h4 className="text-lg font-bold mb-1">营销概览</h4>
                   <p className="text-sm opacity-80 mb-4">当前身份: {currentUser.role === UserRole.SUPER_ADMIN ? '超级管理员' : '营销合伙人'}</p>
                   <div className="flex gap-8">
                      <div>
                        <p className="text-xs opacity-60 uppercase">累计佣金</p>
                        <p className="text-3xl font-bold">¥{currentUser.balance.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs opacity-60 uppercase">专属邀请码</p>
                        <p className="text-3xl font-mono font-bold">{currentUser.marketingCode || '无'}</p>
                      </div>
                   </div>
                </div>
                
                <div>
                  <h5 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Zap size={16} className="text-yellow-500"/> 收益明细</h5>
                  <div className="space-y-2">
                    {transactions.filter(t => t.userId === currentUser.id && t.type === TransactionType.COMMISSION).map(t => (
                      <div key={t.id} className="flex justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-sm text-gray-600">{t.note}</span>
                        <span className="text-sm font-bold text-green-600">+¥{t.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
             </div>
          )}

          {/* 5. 员工管理 Tab */}
          {activeTab === 'user_management' && isSuper && (
            <div className="space-y-4">
               <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users className="text-indigo-600"/> 员工与权限管理</h3>
               <div className="overflow-x-auto border rounded-xl">
                 <table className="min-w-full">
                   <thead className="bg-gray-50">
                     <tr><th className="p-3 text-left text-xs">用户</th><th className="p-3 text-left text-xs">角色</th><th className="p-3 text-left text-xs">余额</th></tr>
                   </thead>
                   <tbody>
                     {allUsers.map(u => (
                       <tr key={u.id} className="border-t">
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

          {/* 6. 系统配置 Tab */}
          {activeTab === 'system_config' && isSuper && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 border rounded-2xl space-y-4">
                   <h4 className="font-bold flex items-center gap-2"><PieChart size={18}/> 前台数据修饰</h4>
                   <div className="space-y-2">
                     <label className="text-xs font-bold text-gray-500">基数设置 (Base Cases)</label>
                     <input type="number" value={config?.marketingBaseCases} onChange={e => setConfig(prev => prev ? {...prev, marketingBaseCases: Number(e.target.value)} : null)} className="w-full border p-2 rounded-lg" />
                   </div>
                   <button onClick={() => config && saveSystemConfig(config).then(() => showToast('配置已保存', 'success'))} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm">保存显示配置</button>
                </div>
                
                <div className="p-6 bg-gray-900 text-white rounded-2xl space-y-4">
                   <h4 className="font-bold flex items-center gap-2"><Key size={18}/> API 密钥管理</h4>
                   <p className="text-xs text-gray-400">点击下方按钮可重新配置 Gemini API Key。</p>
                   <button onClick={handleOpenKey} className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2">
                     <RefreshCw size={16}/> 打开选择器
                   </button>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* 工单处理全屏弹窗 */}
      {editingAppeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 弹窗头部 */}
            <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <div className="bg-indigo-600 text-white p-2 rounded-xl"><Activity size={20}/></div>
                 <div>
                   <h3 className="font-bold text-gray-900">申诉工作台</h3>
                   <p className="text-xs text-gray-500">{editingAppeal.emailAccount}</p>
                 </div>
               </div>
               <button onClick={() => setEditingAppeal(null)} className="p-2 hover:bg-gray-200 rounded-full"><X size={20}/></button>
            </div>

            {/* 弹窗内容区 */}
            <div className="flex-1 flex overflow-hidden">
               {/* 左侧：人工操作区 */}
               <div className="w-80 bg-gray-50/50 border-r p-6 overflow-y-auto space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">客户资料</h4>
                    <div className="bg-white p-3 border rounded-xl text-xs space-y-2 text-gray-600">
                      <p><span className="font-bold">类型:</span> {editingAppeal.accountType}</p>
                      <p><span className="font-bold">登录:</span> {editingAppeal.loginInfo}</p>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">处理决策</h4>
                    <div className="space-y-3">
                      <select 
                        value={editStatus} 
                        onChange={e => setEditStatus(e.target.value as AppealStatus)} 
                        className="w-full border p-3 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {Object.values(AppealStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      
                      <textarea 
                        value={editNote} 
                        onChange={e => setEditNote(e.target.value)} 
                        rows={4} 
                        placeholder="回复给客户的内容..." 
                        className="w-full border p-3 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      
                      <div className="bg-white border p-3 rounded-xl">
                        <label className="text-xs font-bold text-gray-500">扣费金额 (¥)</label>
                        <input 
                          type="number" 
                          value={editDeduction} 
                          onChange={e => setEditDeduction(Number(e.target.value))} 
                          className="w-full text-lg font-bold text-red-600 outline-none mt-1"
                        />
                      </div>
                    </div>
                  </div>
               </div>

               {/* 右侧：AI 建模区 */}
               <div className="flex-1 p-8 flex flex-col bg-white">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-indigo-600"/> Gemini 3 深度 POA 生成</h4>
                    <div className="relative">
                      <input type="file" onChange={handleExcelUpload} className="hidden" id="excel-up" accept=".xlsx,.xls,.csv" />
                      <label htmlFor="excel-up" className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-green-100 transition-colors">
                        <FileSpreadsheet size={16}/> 导入 Excel 绩效表
                      </label>
                    </div>
                  </div>

                  {aiStep === 1 ? (
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                       <div className="grid grid-cols-2 gap-4">
                         <input value={aiStoreName} onChange={e => setAiStoreName(e.target.value)} placeholder="店铺名" className="border p-3 rounded-xl text-sm bg-gray-50" />
                         <input value={aiPartnerId} onChange={e => setAiPartnerId(e.target.value)} placeholder="Partner ID" className="border p-3 rounded-xl text-sm bg-gray-50" />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <select value={aiPoaType} onChange={e => setAiPoaType(e.target.value as PoaType)} className="border p-3 rounded-xl text-sm bg-gray-50">
                             {Object.values(PoaType).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={aiPoaSubType} onChange={e => setAiPoaSubType(e.target.value)} className="border p-3 rounded-xl text-sm bg-gray-50">
                             {POA_TYPE_MAPPING[aiPoaType].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                       </div>
                       <textarea 
                         value={aiRootCause} 
                         onChange={e => setAiRootCause(e.target.value)} 
                         rows={3} 
                         placeholder="简单描述原因，AI 将进行 5-Whys 扩展..." 
                         className="w-full border p-3 rounded-xl text-sm bg-gray-50"
                       />
                       <div className="space-y-1">
                         <div className="flex justify-between">
                            <label className="text-xs font-bold text-gray-400 uppercase">数据建模上下文</label>
                            {aiTableExtract && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle size={12}/> Excel 数据已加载</span>}
                         </div>
                         <textarea 
                           value={aiTableExtract} 
                           onChange={e => setAiTableExtract(e.target.value)} 
                           rows={5} 
                           placeholder="在此粘贴表格数据，或使用右上角按钮导入 Excel..." 
                           className="w-full border-none bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono shadow-inner"
                         />
                       </div>
                       <button 
                         onClick={handleGeneratePOA} 
                         disabled={isGenerating} 
                         className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                       >
                         {isGenerating ? <Loader2 className="animate-spin"/> : <Sparkles/>} 启动 Gemini 3 生成
                       </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0 space-y-4">
                       <div className="flex-1 bg-gray-50 border rounded-2xl p-6 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800">
                         {aiGeneratedText}
                       </div>
                       <div className="flex gap-3">
                         <button onClick={() => setAiStep(1)} className="px-6 py-3 border rounded-xl font-bold text-gray-500 hover:bg-gray-50">重新调整</button>
                         <button 
                           onClick={() => {
                              const blob = new Blob([aiGeneratedText], {type: 'text/plain'});
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `POA_${aiStoreName}.txt`;
                              a.click();
                           }}
                           className="flex-1 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg"
                         >
                           <Download size={18}/> 下载文书
                         </button>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            {/* 弹窗底部操作栏 */}
            <div className="p-5 border-t bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setEditingAppeal(null)} className="px-6 py-2 border rounded-xl font-bold text-gray-500 hover:bg-gray-100">取消</button>
              <button onClick={handleSaveAppealTask} disabled={loading} className="px-8 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">
                {loading ? <Loader2 className="animate-spin"/> : '确认处理结果'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
