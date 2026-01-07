
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
    // 1. Initial Load
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

    // 2. Auth State Listener
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
      await signOut(); // This clears Supabase session AND LocalStorage
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      // CRITICAL FIX: Force a hard browser redirect to clear all React state and memory
      // This prevents the "White Screen" hang by resetting the app completely.
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

  // Routing Logic: Non-Client roles go to AdminDashboard
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
