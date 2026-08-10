import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme, readTheme } from '@/demo/theme';

// 在 React 挂载之前套用已保存的主题，否则会先渲染成默认主题再跳变一下。
applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
