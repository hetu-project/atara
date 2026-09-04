import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
/* 整张样式表搬自 console.html：它大量使用 #left / #mid / #right 这类 id 选择器，
   所以组件必须输出同样的结构，样式才认得出来。 */
import './styles/console.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
