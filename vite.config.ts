import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // 仅在环境变量存在时定义，否则由平台动态注入
      ...(env.API_KEY ? { 'process.env.API_KEY': JSON.stringify(env.API_KEY) } : {})
    }
  };
});