import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
        <Toaster
          position="top-right"
          containerStyle={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)', right: '16px' }}
        />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
