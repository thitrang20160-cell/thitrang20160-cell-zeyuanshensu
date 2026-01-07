
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { signIn, signUp } from '../services/storageService';
import { Eye, EyeOff, ShieldCheck, UserPlus, LogIn, Loader2, Mail, Hash, RefreshCw } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState('');

  // UI Failsafe: If loading takes > 7 seconds, force reset
  useEffect(() => {
    let timer: any;
    if (isLoading) {
        timer = setTimeout(() => {
            if (isLoading) {
                setIsLoading(false);
                setError('请求响应超时，请刷新页面后重试');
            }
        }, 7000);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setIsLoading(true);

    if (!email || !password) {
      setError('请输入邮箱和密码');
      setIsLoading(false);
      return;
    }
    
    try {
      if (isRegistering) {
        const { user, error: regError } = await signUp(email, password, inviteCode);
        if (regError) setError(regError);
        else if (user) onLogin(user);
      } else {
        const { user, error: loginError } = await signIn(email, password);
        if (loginError) {
             setError(loginError);
        } else if (user) {
             onLogin(user);
             return; // Success, don't set loading false, let component unmount
        }
      }
    } catch (err) {
      setError('网络连接错误');
    } finally {
      // Only set loading false if we didn't succeed (if we succeeded, component unmounts)
      // Actually, setting it false is fine, React will ignore updates on unmounted component
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-10 text-center relative">
          <ShieldCheck className="w-16 h-16 text-white/20 absolute -top-4 -right-4 rotate-12" />
          <h2 className="text-3xl font-black text-white tracking-tighter">
            {isRegistering ? '加入泽远跨境' : '泽远申诉系统 V2'}
          </h2>
          <p className="text-indigo-100 mt-2 text-sm font-medium opacity-80">
            {isRegistering ? '开启您的专业申诉加速之旅' : 'AI 智能内核 • 自动化申诉流水线'}
          </p>
        </div>

        <div className="p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">账户邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-gray-50/50" placeholder="name@example.com" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">安全密码</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-gray-50/50" placeholder="至少 6 位字符" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isRegistering && (
              <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">邀请码 (可选)</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-gray-50/50" placeholder="填写营销人员的邀请码" />
                </div>
              </div>
            )}

            {error && <div className="p-4 rounded-2xl bg-red-50 text-red-600 text-xs font-bold flex items-center gap-2 animate-pulse"><AlertTriangleIcon size={16} /> {error}</div>}
            {msg && <div className="p-4 rounded-2xl bg-green-50 text-green-600 text-xs font-bold flex items-center gap-2"><CheckCircleIcon size={16} /> {msg}</div>}

            <button type="submit" disabled={isLoading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95">
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : (isRegistering ? <UserPlus size={20} /> : <LogIn size={20} />)}
              {isRegistering ? '立即创建账户' : (isLoading ? '正在安全验证...' : '安全认证并登录')}
            </button>
            
            {isLoading && (
                 <button type="button" onClick={() => window.location.reload()} className="w-full py-2 text-gray-400 text-xs hover:text-gray-600 flex items-center justify-center gap-1">
                    <RefreshCw size={12}/> 等太久了？刷新重试
                 </button>
            )}
          </form>

          <div className="mt-8 text-center">
            <button onClick={() => { setIsRegistering(!isRegistering); setError(''); setMsg(''); }} className="text-sm text-indigo-600 hover:text-indigo-800 font-bold">
              {isRegistering ? '已有账号？立即登录' : '没有账户？三秒极速注册'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AlertTriangleIcon = ({size}: {size: number}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
);

const CheckCircleIcon = ({size}: {size: number}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
