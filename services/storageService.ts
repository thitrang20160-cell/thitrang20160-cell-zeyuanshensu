import { CaseData, GlobalSettings, ReferenceCase, User, UserRole } from '../types';

const CASE_STORAGE_KEY = 'walmart_poa_cases_v5';
const SETTINGS_STORAGE_KEY = 'walmart_poa_settings_v5_structured';
const REFERENCE_STORAGE_KEY = 'walmart_poa_references_v1';
const USERS_STORAGE_KEY = 'walmart_poa_users_v1';
const CURRENT_USER_KEY = 'walmart_poa_current_session';

// --- Auth & Users ---
export const loadUsers = (): User[] => {
  try {
    const data = localStorage.getItem(USERS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveUsers = (users: User[]) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

export const registerUser = (username: string, password: string, role: UserRole = 'client', companyName?: string): User => {
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    throw new Error("用户名已存在");
  }
  const newUser: User = {
    id: Date.now().toString(),
    username,
    password, // Note: In production, hash this!
    role,
    companyName
  };
  users.push(newUser);
  saveUsers(users);
  return newUser;
};

export const loginUser = (username: string, password: string): User => {
  const users = loadUsers();
  // Special Backdoor for Admin Setup (First time use)
  if (username === 'admin' && password === 'admin888' && users.length === 0) {
    const rootAdmin: User = { id: 'root', username: 'admin', password: 'admin888', role: 'super_admin', companyName: 'System Super Admin' };
    saveUsers([rootAdmin]);
    return rootAdmin;
  }

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    throw new Error("账号或密码错误");
  }
  return user;
};

export const getCurrentSession = (): User | null => {
  try {
    const data = localStorage.getItem(CURRENT_USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const setCurrentSession = (user: User | null) => {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
};

// NEW: Admin Management Functions
export const getAllUsers = (): User[] => {
  return loadUsers();
};

export const deleteUser = (userId: string) => {
  const users = loadUsers();
  const filtered = users.filter(u => u.id !== userId);
  saveUsers(filtered);
};

export const updateUser = (updatedUser: User) => {
  const users = loadUsers();
  const index = users.findIndex(u => u.id === updatedUser.id);
  if (index !== -1) {
    users[index] = updatedUser;
    saveUsers(users);
  }
};

// --- Cases ---
export const loadCases = (): CaseData[] => {
  try {
    const data = localStorage.getItem(CASE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load cases", e);
    return [];
  }
};

export const saveCases = (cases: CaseData[]) => {
  try {
    localStorage.setItem(CASE_STORAGE_KEY, JSON.stringify(cases));
  } catch (e) {
    console.error("Failed to save cases", e);
  }
};

// --- Settings ---
export const loadSettings = (): GlobalSettings => {
  try {
    const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // Migration: Ensure new fields exist if loading old data
      return {
        selectedProvider: parsed.selectedProvider || 'gemini',
        apiKey: parsed.apiKey || '',
        deepseekKey: parsed.deepseekKey || '',
        supabaseUrl: parsed.supabaseUrl || '',
        supabaseKey: parsed.supabaseKey || '',
        walmartClientId: parsed.walmartClientId || '',
        walmartClientSecret: parsed.walmartClientSecret || '',
        enableSimulationMode: parsed.enableSimulationMode !== false, // Default to true for safety
        strategyGeneral: parsed.strategyGeneral || '',
        strategyLogistics: parsed.strategyLogistics || '',
        strategyIP: parsed.strategyIP || ''
      };
    }
    return { 
      selectedProvider: 'gemini',
      apiKey: '', 
      deepseekKey: '',
      supabaseUrl: '',
      supabaseKey: '',
      walmartClientId: '',
      walmartClientSecret: '',
      enableSimulationMode: true,
      strategyGeneral: '态度诚恳，数据导向。不要使用生硬的模板语言。强调“以客户为中心”的整改决心。',
      strategyLogistics: '逻辑重点：排查 ERP 数据抓取延迟 -> 立即更换承运商（如 FedEx/UPS） -> 开启周末配送模式。',
      strategyIP: '逻辑重点：立即删除侵权 Listing -> 审查全店类似产品 -> 引入第三方知识产权律所进行员工培训。'
    };
  } catch (e) {
    return { 
      selectedProvider: 'gemini', apiKey: '', deepseekKey: '', 
      supabaseUrl: '', supabaseKey: '',
      walmartClientId: '', walmartClientSecret: '', enableSimulationMode: true,
      strategyGeneral: '', strategyLogistics: '', strategyIP: '' 
    };
  }
};

export const saveSettings = (settings: GlobalSettings) => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

// --- Reference Library ---
export const loadReferences = (): ReferenceCase[] => {
  try {
    const data = localStorage.getItem(REFERENCE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveReferences = (refs: ReferenceCase[]) => {
  try {
    localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(refs));
  } catch (e) {
    console.error("Reference storage limit reached?", e);
    alert("本地存储空间可能已满。请导出备份并清理旧数据。");
  }
};