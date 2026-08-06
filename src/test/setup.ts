import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// src/lib/supabase.ts 在模块加载时会校验 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，
// 缺失即抛错（故意的 fail-fast，见该文件注释）。测试环境没有 .env，
// 这里用假值占位，让依赖它的模块（api.ts 等）能被正常 import，
// 测试本身不会发出真实网络请求，所以假值不影响断言。
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
