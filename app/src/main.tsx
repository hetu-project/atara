import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PrivyRoot from './components/PrivyRoot'
import Boundary from './components/Boundary'
/* The whole stylesheet is lifted from console.html: it leans heavily on id
   selectors like #left / #mid / #right, so components must emit the same
   structure for the styles to match. */
import './styles/console.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <PrivyRoot>
        <App />
      </PrivyRoot>
    </Boundary>
  </StrictMode>,
)
