
import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ClientDashboard } from './pages/ClientDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { User, UserRole } from './types';
import { supabase, getCurrentUserProfile, signOut } from './services/storageService';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './components/Toast';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    // 1. 初始化加载
    const initAuth = async () => {
      try {
        const user = await getCurrentUserProfile();
        setCurrentUser(user);
      } catch (e) {
        console.error("Auth init error", e);
      } finally {
        // 无论成功失败，必须结束加载状态
        setInitLoading(false);
      }
    };
    initAuth();

    // 2. 监听登录状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const user = await getCurrentUserProfile();
        setCurrentUser(user);
        setInitLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setInitLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(); // 清除 Supabase 会话和本地存储
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      // 【核心修复】: 强制浏览器重定向到根路径
      // 这会强制刷新页面，清除所有 React 内存状态，防止白屏死循环
      window.location.href = '/'; 
    }
  };

  const refreshUser = useCallback(async () => {
    const latestUser = await getCurrentUserProfile();
    if (latestUser) {
      setCurrentUser(latestUser);
    }
  }, []);

  if (initLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-indigo-600">
        <Loader2 className="animate-spin w-12 h-12" />
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
