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
      (v.phone || '').includes(q) ||
      (v.employee_id || '').includes(q) ||
      (v.org || '').includes(q) ||
      (v.plate || '').includes(q) ||
      (v.purpose || '').includes(q) ||
      (v.notes || '').includes(q) ||
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

  const printPDF = () => {
    const target = day || new Date().toISOString().slice(0, 10)
    const rows = visits.filter((v) => new Date(v.entered_at).toISOString().slice(0, 10) === target)
    const dateStr = new Date(target + 'T12:00:00').toLocaleDateString('ar-SY-u-nu-latn', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const body = rows.length
      ? rows
          .map(
            (v, i) => `<tr>
              <td>${i + 1}</td>
              <td class="b">${v.visitor_name}</td>
              <td dir="ltr">${v.phone || v.employee_id || '—'}</td>
              <td dir="ltr">${v.plate || '—'}</td>
              <td>${v.purpose || '—'}</td>
              <td>${v.notes || '—'}</td>
              <td>${v.guards?.name || '—'}</td>
              <td>${fmtDateTime(v.entered_at)}</td>
              <td>${v.exited_at ? fmtDateTime(v.exited_at) : 'لم يغادر'}</td>
              <td>${duration(v.entered_at, v.exited_at)}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="10" style="text-align:center">لا توجد زيارات مسجلة في هذا اليوم</td></tr>'
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>التقرير اليومي — ${target}</title>
<style>
@font-face{font-family:'Qomra';src:url('${location.origin}/fonts/Qomra-Regular.woff2') format('woff2');font-weight:400}
@font-face{font-family:'Qomra';src:url('${location.origin}/fonts/Qomra-Bold.woff2') format('woff2');font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Qomra','IBM Plex Sans Arabic',sans-serif;color:#161616;padding:20px;font-size:11px}
.head{text-align:center;border-bottom:2px solid #b9a779;padding-bottom:14px;margin-bottom:6px}
.head .stars{color:#b9a779;letter-spacing:6px;font-size:13px}
.head h1{color:#002723;font-size:20px;margin:6px 0 2px}
.head h2{color:#02443a;font-size:15px;font-weight:400}
.meta{display:flex;justify-content:space-between;margin:12px 0;font-size:13.5px;color:#3c3c3d}
table{width:100%;border-collapse:collapse;margin-top:6px}
th{background:#02443a;color:#b9a779;padding:6px 5px;font-size:10.5px;text-align:right}
td{border:1px solid #cfc9b5;padding:5px 5px}
td.b{font-weight:700}
tr:nth-child(even) td{background:#f4f2e8}
.summary{margin-top:14px;font-size:13px;color:#02443a}
.sign{display:flex;justify-content:space-between;margin-top:60px;padding:0 30px}
.sign .box{text-align:center;width:220px}
.sign .line{border-top:1.5px solid #161616;margin-top:55px;padding-top:8px;font-weight:700;color:#002723}
@page{size:A4 portrait;margin:10mm}
@media print{body{padding:10px}}
</style></head><body>
<div class="head">
  <img src="${location.origin}/logo.png" alt="" style="height:110px;object-fit:contain;margin-bottom:6px" />
  <h1>مديرية الطوارئ وإدارة الكوارث — حمص</h1>
  <h2>التقرير اليومي لسجل دخول وخروج الزوار</h2>
</div>
<div class="meta"><span>التاريخ: ${dateStr}</span><span>عدد الزيارات: ${rows.length}</span></div>
<table>
  <thead><tr><th>#</th><th>الاسم</th><th>الهاتف/الرقم الوظيفي</th><th>لوحة السيارة</th><th>الغاية</th><th>ملاحظات</th><th>الحارس المناوب</th><th>الدخول</th><th>الخروج</th><th>المدة</th></tr></thead>
  <tbody>${body}</tbody>
</table>
<div class="summary">ما يزال داخل المديرية: ${rows.filter((v) => !v.exited_at).length} — غادروا: ${rows.filter((v) => v.exited_at).length}</div>
<div class="sign">
  <div class="box"><div class="line">توقيع مسؤول الحراسة</div></div>
  <div class="box"><div class="line">توقيع رئيس الدائرة</div></div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</` + `script>
</body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  const exportCSV = () => {
    const rows = [
      ['الاسم', 'الهاتف', 'الرقم الوظيفي', 'الجهة', 'لوحة السيارة', 'الغاية', 'ملاحظات', 'الحارس المناوب', 'وقت الدخول', 'وقت الخروج', 'المدة'],
      ...filtered.map((v) => [
        v.visitor_name,
        v.phone || '',
        v.employee_id || '',
        v.org || '',
        v.plate || '',
        v.purpose || '',
        v.notes || '',
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
          <div className="head-actions">
            <button className="btn btn-gold" style={{ padding: '7px 14px', fontSize: 13 }} onClick={printPDF}>
              🖨 تقرير PDF اليومي
            </button>
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
            <input type="date" lang="en" dir="ltr" value={day} onChange={(e) => setDay(e.target.value)} />
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
                  <th>الهاتف / الرقم الوظيفي</th>
                  <th>اللوحة</th>
                  <th>الغاية</th>
                  <th>ملاحظات</th>
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
                    <td colSpan={10} style={{ textAlign: 'center', color: 'var(--stone)' }}>
                      لا توجد نتائج
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 700 }}>{v.visitor_name}</td>
                      <td dir="ltr">{v.phone || v.employee_id || '—'}</td>
                      <td dir="ltr">{v.plate || '—'}</td>
                      <td>{v.purpose || '—'}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 140 }}>{v.notes || '—'}</td>
                      <td>{v.guards?.name || '—'}</td>
                      <td>{fmtDateTime(v.entered_at)}</td>
                      <td>{v.exited_at ? fmtDateTime(v.exited_at) : '—'}</td>
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
