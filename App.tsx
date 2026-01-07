
import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ClientDashboard } from './pages/ClientDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { User, UserRole } from './types';
import { supabase, getCurrentUserProfile, signOut } from './services/storageService';
import { Loader2, RefreshCw } from 'lucide-react';
import { ToastProvider } from './components/Toast';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('系统初始化中...');

  useEffect(() => {
    let mounted = true;

    // 1. 初始化加载 - 带超时熔断机制
    const initAuth = async () => {
      // 熔断器：如果 3秒内 Supabase 没反应，强制结束 Loading，防止白屏
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );

      try {
        // 使用 Promise.race 竞态
        await Promise.race([
          (async () => {
             const user = await getCurrentUserProfile();
             if (mounted) setCurrentUser(user);
          })(),
          timeoutPromise
        ]);
      } catch (e: any) {
        console.warn("Auth init warning:", e);
        if (e.message === "Timeout") {
           console.error("Supabase connection timed out. Clearing cache.");
           // 超时通常意味着 LocalStorage 里的 Token 坏了，强制清理
           localStorage.clear();
           sessionStorage.clear();
        }
      } finally {
        if (mounted) setInitLoading(false);
      }
    };

    initAuth();

    // 2. 监听登录状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_IN' && session) {
        setLoadingText('正在同步用户数据...');
        // 这里不加 Loading，为了体验更流畅，但在后台更新用户
        const user = await getCurrentUserProfile();
        if (mounted) setCurrentUser(user);
      } else if (event === 'SIGNED_OUT') {
        if (mounted) setCurrentUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      setInitLoading(true);
      setLoadingText('正在安全退出...');
      await signOut(); 
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      // 强制刷新以彻底清除内存状态
      window.location.href = '/'; 
    }
  };

  const refreshUser = useCallback(async () => {
    const latestUser = await getCurrentUserProfile();
    if (latestUser) {
      setCurrentUser(latestUser);
    }
  }, []);

  // 紧急重置按钮：如果真的卡死，用户可以点击这个
  if (initLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-indigo-600 space-y-4">
        <Loader2 className="animate-spin w-12 h-12" />
        <p className="text-sm font-medium text-gray-500 animate-pulse">{loadingText}</p>
        
        {/* Failsafe Button - shows after 2 seconds via CSS delay usually, but here simple */}
        <button 
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className="mt-8 text-xs text-gray-400 hover:text-red-500 underline flex items-center gap-1"
        >
          <RefreshCw size={12}/> 还是进不去？点击强制重置
        </button>
      </div>
    );
  }

  // 路由逻辑: 非客户角色进入管理端
  const isManagementRole = currentUser && currentUser.role !== UserRole.CLIENT;

  return (
    <ToastProvider>
      <Layout currentUser={currentUser} onLogout={handleLogout}>
        {!currentUser ? (
          <Login onLogin={(user) => setCurrentUser(user)} />
        ) : (
          <>
            {isManagementRole ? (
              <AdminDashboard currentUser={currentUser} />
            ) : (
              <ClientDashboard currentUser={currentUser} refreshUser={refreshUser} />
            )}
          </>
        )}
      </Layout>
    </ToastProvider>
  );
};

export default App;
