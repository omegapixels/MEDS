import { useEffect, useState, useCallback } from 'react'
import GuardView from './GuardView.jsx'
import AdminView from './AdminView.jsx'

export default function App() {
  const [tab, setTab] = useState(location.hash === '#/admin' ? 'admin' : 'guard')

  useEffect(() => {
    const onHash = () => setTab(location.hash === '#/admin' ? 'admin' : 'guard')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((t) => {
    location.hash = t === 'admin' ? '#/admin' : '#/'
    setTab(t)
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div className="stars">★ ★ ★</div>
        <h1>مديرية الطوارئ وإدارة الكوارث — حمص</h1>
        <div className="sub">سجل دخول وخروج الزوار — نقطة الحراسة</div>
        <div className="sub-en">Emergency &amp; Disaster Management Directorate — Homs</div>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === 'guard' ? 'active' : ''}`} onClick={() => go('guard')}>
          واجهة الحارس
        </button>
        <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => go('admin')}>
          واجهة المدير
        </button>
      </nav>

      {tab === 'guard' ? <GuardView /> : <AdminView />}

      <footer className="footer">
        الجمهورية العربية السورية — وزارة الطوارئ وإدارة الكوارث
      </footer>
    </div>
  )
}
