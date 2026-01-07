
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

  const clearAndRedirect = () => {
    setCurrentUser(null);
    window.location.reload(); // 彻底清理状态并重新加载页面
  };

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
    await signOut();
    clearAndRedirect();
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

  // 判定是否为管理后台角色 (老板、员工、财务、营销)
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
