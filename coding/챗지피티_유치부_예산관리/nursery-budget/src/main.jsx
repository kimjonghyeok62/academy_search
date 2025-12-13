import React from 'react'
import ReactDOM from 'react-dom/client'
import BudgetMain from './BudgetMain.jsx'
import './index.css'

console.log("%c VERSION: 2026 FINAL ", "background: #222; color: #bada55; font-size: 20px");
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BudgetMain />
  </React.StrictMode>,
)
