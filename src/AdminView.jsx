import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'
import { fmtDateTime, fmtTime, duration, todayISO } from './helpers.js'

export default function AdminView() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem('meds_admin') === '1')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const tryUnlock = async (e) => {
    e.preventDefault()
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_password').single()
    if (data && pw === data.value) {
      sessionStorage.setItem('meds_admin', '1')
      setUnlocked(true)
    } else {
      setErr('كلمة السر غير صحيحة')
    }
  }

  if (!unlocked) {
    return (
      <div className="card lock">
        <div className="card-head">
          <h2>دخول المدير</h2>
        </div>
        <div className="card-body">
          <div className="icon">🔐</div>
          <form onSubmit={tryUnlock}>
            <div className="field">
              <label>كلمة السر</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value)
                  setErr('')
                }}
                autoFocus
              />
            </div>
            {err && <p style={{ color: 'var(--damask)', fontSize: 13.5, marginBottom: 10 }}>{err}</p>}
            <button className="btn btn-primary">دخول</button>
          </form>
        </div>
      </div>
    )
  }

  return <Dashboard onLock={() => { sessionStorage.removeItem('meds_admin'); setUnlocked(false) }} />
}

function Dashboard({ onLock }) {
  const [visits, setVisits] = useState([])
  const [guards, setGuards] = useState([])
  const [q, setQ] = useState('')
  const [day, setDay] = useState('')
  const [newGuard, setNewGuard] = useState('')
  const [newPw, setNewPw] = useState('')
  const [toast, setToast] = useState('')

  const notify = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  const load = useCallback(async () => {
    const [v, g] = await Promise.all([
      supabase.from('visits').select('*, guards(name)').order('entered_at', { ascending: false }).limit(500),
      supabase.from('guards').select('*').order('name'),
    ])
    if (!v.error) setVisits(v.data)
    if (!g.error) setGuards(g.data)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const inside = visits.filter((v) => !v.exited_at)
  const today = visits.filter((v) => v.entered_at >= todayISO())

  const filtered = visits.filter((v) => {
    const matchQ =
      !q ||
      v.visitor_name.includes(q) ||
      v.phone.includes(q) ||
      (v.purpose || '').includes(q) ||
      (v.guards?.name || '').includes(q)
    const matchDay = !day || new Date(v.entered_at).toISOString().slice(0, 10) === day
    return matchQ && matchDay
  })

  const addGuard = async (e) => {
    e.preventDefault()
    if (!newGuard.trim()) return
    const { error } = await supabase.from('guards').insert({ name: newGuard.trim() })
    if (error) return notify('تعذّرت إضافة الحارس')
    setNewGuard('')
    notify('✓ تمت إضافة الحارس')
    load()
  }

  const toggleGuard = async (g) => {
    await supabase.from('guards').update({ active: !g.active }).eq('id', g.id)
    load()
  }

  const changePw = async (e) => {
    e.preventDefault()
    if (!newPw.trim()) return
    const { error } = await supabase.from('app_settings').update({ value: newPw.trim() }).eq('key', 'admin_password')
    if (error) return notify('تعذّر تغيير كلمة السر')
    setNewPw('')
    notify('✓ تم تغيير كلمة السر')
  }

  const exportCSV = () => {
    const rows = [
      ['الاسم', 'الهاتف', 'الغاية', 'الحارس المناوب', 'وقت الدخول', 'وقت الخروج', 'المدة'],
      ...filtered.map((v) => [
        v.visitor_name,
        v.phone,
        v.purpose || '',
        v.guards?.name || '',
        fmtDateTime(v.entered_at),
        v.exited_at ? fmtDateTime(v.exited_at) : 'داخل المديرية',
        duration(v.entered_at, v.exited_at),
      ]),
    ]
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `سجل-الزوار-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="num">{inside.length}</div>
          <div className="lbl">داخل المديرية الآن</div>
        </div>
        <div className="stat">
          <div className="num">{today.length}</div>
          <div className="lbl">زيارات اليوم</div>
        </div>
        <div className="stat">
          <div className="num">{visits.length}</div>
          <div className="lbl">إجمالي الزيارات المسجلة</div>
        </div>
        <div className="stat">
          <div className="num">{guards.filter((g) => g.active).length}</div>
          <div className="lbl">حرس في الخدمة</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>سجل الزيارات</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-gold" style={{ padding: '7px 14px', fontSize: 13 }} onClick={exportCSV}>
              ⬇ تصدير CSV
            </button>
            <button className="btn btn-exit" onClick={onLock}>
              قفل
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="toolbar">
            <input type="text" placeholder="🔍 بحث بالاسم أو الهاتف…" value={q} onChange={(e) => setQ(e.target.value)} />
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            {(q || day) && (
              <button className="btn btn-ghost" onClick={() => { setQ(''); setDay('') }}>
                إلغاء الفلترة
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الهاتف</th>
                  <th>الغاية</th>
                  <th>الحارس</th>
                  <th>الدخول</th>
                  <th>الخروج</th>
                  <th>المدة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--stone)' }}>
                      لا توجد نتائج
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 700 }}>{v.visitor_name}</td>
                      <td dir="ltr">{v.phone}</td>
                      <td>{v.purpose || '—'}</td>
                      <td>{v.guards?.name || '—'}</td>
                      <td>{fmtDateTime(v.entered_at)}</td>
                      <td>{v.exited_at ? fmtTime(v.exited_at) : '—'}</td>
                      <td>{duration(v.entered_at, v.exited_at)}</td>
                      <td>
                        {v.exited_at ? <span className="pill out">غادر</span> : <span className="pill in">بالداخل</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid section-gap">
        <div className="card">
          <div className="card-head">
            <h2>إدارة الحرس</h2>
            <span className="badge">{guards.length}</span>
          </div>
          <div className="card-body">
            {guards.map((g) => (
              <div className="guard-row" key={g.id}>
                <span className={`g-name ${g.active ? '' : 'inactive'}`}>🛡 {g.name}</span>
                <button className="btn btn-danger-ghost" onClick={() => toggleGuard(g)}>
                  {g.active ? 'إيقاف' : 'تفعيل'}
                </button>
              </div>
            ))}
            {guards.length === 0 && <div className="empty">لم تتم إضافة أي حارس بعد</div>}
            <form className="add-guard" onSubmit={addGuard}>
              <input placeholder="اسم الحارس الجديد" value={newGuard} onChange={(e) => setNewGuard(e.target.value)} />
              <button className="btn btn-gold">إضافة</button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>الإعدادات</h2>
          </div>
          <div className="card-body">
            <form onSubmit={changePw}>
              <div className="field">
                <label>تغيير كلمة سر المدير</label>
                <input
                  type="password"
                  placeholder="كلمة السر الجديدة"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
              </div>
              <button className="btn btn-primary">حفظ كلمة السر</button>
            </form>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
