
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
    const initAuth = async () => {
      try {
        const user = await getCurrentUserProfile();
        setCurrentUser(user);
      } catch (e) {
        console.error("Auth init error", e);
      } finally {
        setInitLoading(false);
      }
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const user = await getCurrentUserProfile();
        setCurrentUser(user);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      setCurrentUser(null);
      // 使用 replace 彻底替换历史记录并刷新，清除所有内存状态
      window.location.replace('/');
    } catch (err) {
      console.error("Logout failed", err);
      window.location.reload();
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-brand-600">
        <Loader2 className="animate-spin w-10 h-10" />
      </div>
    );
  }

  // 只要不是普通 CLIENT 客户，都进入 AdminDashboard，由 AdminDashboard 内部进行权限分流
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
