import { useEffect, useState, useCallback } from 'react'
import GuardView from './GuardView.jsx'
import AdminView from './AdminView.jsx'

export default function App() {
  const [tab, setTab] = useState(location.hash === '#/admin' ? 'admin' : 'guard')
  const [installEvt, setInstallEvt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    const onHash = () => setTab(location.hash === '#/admin' ? 'admin' : 'guard')
    window.addEventListener('hashchange', onHash)
    const onPrompt = (e) => {
      e.preventDefault()
      setInstallEvt(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

  const install = async () => {
    if (installEvt) {
      installEvt.prompt()
      const { outcome } = await installEvt.userChoice
      if (outcome === 'accepted') setInstallEvt(null)
    } else if (isIos) {
      setShowIosHint(true)
    }
  }

  const go = useCallback((t) => {
    location.hash = t === 'admin' ? '#/admin' : '#/'
    setTab(t)
  }, [])

  return (
    <div className="app">
      {!isStandalone && (installEvt || isIos) && (
        <button className="install-btn" onClick={install}>
          ⬇ تثبيت التطبيق
        </button>
      )}
      {showIosHint && (
        <div className="ios-hint" onClick={() => setShowIosHint(false)}>
          للتثبيت على آيفون: افتح قائمة المشاركة <b>⎋</b> ثم اختر «إضافة إلى الشاشة الرئيسية»
        </div>
      )}
      <header className="header">
        <img src="/logo.png" alt="" className="logo" onError={(e) => (e.target.style.display = 'none')} />
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
