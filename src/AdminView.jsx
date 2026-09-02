import { Fragment, useEffect, useState, useCallback } from 'react'
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

const PAGE_SIZE_OPTIONS = [25, 50, 100]

// ===== شريط ترقيم صفحات عام =====
function Pagination({ page, setPage, totalItems, pageSize, setPageSize }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const clampedPage = Math.min(page, totalPages)
  if (clampedPage !== page) setPage(clampedPage)
  if (totalItems === 0) return null
  return (
    <div className="pagination">
      <button className="btn btn-ghost" disabled={clampedPage <= 1} onClick={() => setPage(clampedPage - 1)}>
        السابق ›
      </button>
      <span className="page-info">
        صفحة {clampedPage} من {totalPages} — {totalItems} نتيجة
      </span>
      <button className="btn btn-ghost" disabled={clampedPage >= totalPages} onClick={() => setPage(clampedPage + 1)}>
        ‹ التالي
      </button>
      <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n} بالصفحة</option>
        ))}
      </select>
    </div>
  )
}

function Dashboard({ onLock }) {
  const [visits, setVisits] = useState([])
  const [guards, setGuards] = useState([])
  const [deposits, setDeposits] = useState([])
  const [q, setQ] = useState('')
  const [day, setDay] = useState('')
  const [fGuard, setFGuard] = useState('')
  const [fPurpose, setFPurpose] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fType, setFType] = useState('')
  const [newGuard, setNewGuard] = useState('')
  const [accId, setAccId] = useState(null)
  const [accUser, setAccUser] = useState('')
  const [accPass, setAccPass] = useState('')
  const [newPw, setNewPw] = useState('')
  const [listTexts, setListTexts] = useState({ list_purposes: '', list_training_depts: '', list_homs_depts: '', list_orgs: '' })
  const [edit, setEdit] = useState(null)
  const [toast, setToast] = useState('')

  // ترقيم صفحات سجل الزيارات
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ترقيم صفحات سجل الأمانات
  const [depPage, setDepPage] = useState(1)
  const [depPageSize, setDepPageSize] = useState(15)

  const LIST_LABELS = {
    list_purposes: 'الغاية من الزيارة',
    list_training_depts: 'الدوائر المعنية بالتدريب',
    list_homs_depts: 'دوائر مديرية حمص (للزيارات والاجتماعات)',
    list_orgs: 'الوزارة / المديريات',
  }

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', Object.keys(LIST_LABELS))
      .then(({ data }) => {
        if (!data) return
        const next = { list_purposes: '', list_training_depts: '', list_homs_depts: '', list_orgs: '' }
        data.forEach((r) => {
          try {
            next[r.key] = JSON.parse(r.value).join('\n')
          } catch { /* تجاهل */ }
        })
        setListTexts(next)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveList = async (key) => {
    const arr = listTexts[key].split('\n').map((s) => s.trim()).filter(Boolean)
    if (!arr.length) return notify('القائمة لا يمكن أن تكون فارغة')
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value: JSON.stringify(arr) })
    if (error) return notify('تعذّر حفظ القائمة')
    notify(`✓ حُفظت قائمة «${LIST_LABELS[key]}» (${arr.length} خياراً)`)
  }

  const notify = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  const load = useCallback(async () => {
    const [v, g, d] = await Promise.all([
      supabase
        .from('visits')
        .select('*, guards!visits_guard_id_fkey(name), exit_guard:guards!visits_exit_guard_id_fkey(name)')
        .order('entered_at', { ascending: false })
        .limit(500),
      supabase.from('guards').select('*').order('name'),
      supabase
        .from('deposits')
        .select('*, guards!deposits_guard_id_fkey(name), delivery_guard:guards!deposits_delivery_guard_id_fkey(name)')
        .order('received_at', { ascending: false })
        .limit(500),
    ])
    if (!v.error) setVisits(v.data)
    if (!g.error) setGuards(g.data)
    if (!d.error) setDeposits(d.data)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const inside = visits.filter((v) => !v.exited_at)
  const today = visits.filter((v) => v.entered_at >= todayISO())
  const depositsHeld = deposits.filter((d) => d.status === 'held')
  const depositsPending = deposits.filter((d) => d.status === 'pending')

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
    const matchGuard = !fGuard || String(v.guard_id) === fGuard
    const matchPurpose = !fPurpose || (v.purpose || '').startsWith(fPurpose)
    const matchStatus = !fStatus || (fStatus === 'in' ? !v.exited_at : !!v.exited_at)
    const matchType = !fType || (v.visitor_type || 'guest') === fType
    return matchQ && matchDay && matchGuard && matchPurpose && matchStatus && matchType
  })

  // إعادة الصفحة إلى البداية عند تغيّر أي فلتر
  useEffect(() => {
    setPage(1)
  }, [q, day, fGuard, fPurpose, fStatus, fType, pageSize])

  const pagedFiltered = filtered.slice((page - 1) * pageSize, page * pageSize)

  const purposeOptions = [...new Set(visits.map((v) => (v.purpose || '').split(' — ')[0]).filter(Boolean))]
  const hasFilters = q || day || fGuard || fPurpose || fStatus || fType
  const clearFilters = () => { setQ(''); setDay(''); setFGuard(''); setFPurpose(''); setFStatus(''); setFType('') }

  const addGuard = async (e) => {
    e.preventDefault()
    if (!newGuard.trim()) return
    const { error } = await supabase.from('guards').insert({ name: newGuard.trim() })
    if (error) return notify('تعذّرت إضافة الحارس')
    setNewGuard('')
    notify('✓ تمت إضافة الحارس')
    load()
  }

  const openAccount = (g) => {
    setAccId(g.id === accId ? null : g.id)
    setAccUser(g.username || '')
    setAccPass('')
  }

  const saveAccount = async (e) => {
    e.preventDefault()
    if (!accUser.trim() || !accPass.trim()) return notify('أدخل اسم المستخدم وكلمة المرور')
    const { error } = await supabase
      .from('guards')
      .update({ username: accUser.trim(), password: accPass.trim() })
      .eq('id', accId)
    if (error) return notify(error.code === '23505' ? 'اسم المستخدم مستخدم لحارس آخر' : 'تعذّر حفظ الحساب')
    setAccId(null)
    notify('✓ تم حفظ حساب الحارس')
    load()
  }

  const deleteVisit = async (v) => {
    if (!window.confirm(`هل أنت متأكد من حذف تسجيل «${v.visitor_name}» نهائياً من السجل؟`)) return
    const { error } = await supabase.from('visits').delete().eq('id', v.id)
    if (error) return notify('تعذّر حذف التسجيل')
    notify('✓ تم حذف التسجيل')
    load()
  }

  const toLocal = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const openEdit = (v) => {
    if (edit && edit.id === v.id) return setEdit(null)
    setEdit({
      id: v.id,
      visitor_name: v.visitor_name || '',
      phone: v.phone || '',
      employee_id: v.employee_id || '',
      org: v.org || '',
      plate: v.plate || '',
      purpose: v.purpose || '',
      notes: v.notes || '',
      entered_at: toLocal(v.entered_at),
      exited_at: toLocal(v.exited_at),
    })
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!edit.visitor_name.trim()) return notify('الاسم مطلوب')
    if (!edit.entered_at) return notify('وقت الدخول مطلوب')
    const { error } = await supabase
      .from('visits')
      .update({
        visitor_name: edit.visitor_name.trim(),
        phone: edit.phone.trim() || null,
        employee_id: edit.employee_id.trim() || null,
        org: edit.org.trim() || null,
        plate: edit.plate.trim() || null,
        purpose: edit.purpose.trim() || null,
        notes: edit.notes.trim() || null,
        entered_at: new Date(edit.entered_at).toISOString(),
        exited_at: edit.exited_at ? new Date(edit.exited_at).toISOString() : null,
      })
      .eq('id', edit.id)
    if (error) return notify('تعذّر حفظ التعديلات')
    setEdit(null)
    notify('✓ تم حفظ التعديلات')
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

  // ===== الأمانات: موافقة / رفض تسليم =====
  const approveDeposit = async (d) => {
    const { error } = await supabase.from('deposits').update({ status: 'delivered' }).eq('id', d.id)
    if (error) return notify('تعذّرت الموافقة على التسليم')
    notify(`✓ تمت الموافقة على تسليم أمانة «${d.depositor_name}» إلى ${d.receiver_name}`)
    load()
  }

  const rejectDeposit = async (d) => {
    if (!window.confirm('هل أنت متأكد من رفض طلب التسليم؟ ستعود الأمانة إلى حالة «نشطة».')) return
    const { error } = await supabase
      .from('deposits')
      .update({ status: 'held', receiver_name: null, delivery_guard_id: null, delivery_requested_at: null, delivered_at: null })
      .eq('id', d.id)
    if (error) return notify('تعذّر رفض الطلب')
    notify('↩️ تم رفض طلب التسليم — الأمانة نشطة من جديد')
    load()
  }

  const deleteDeposit = async (d) => {
    if (!window.confirm(`هل أنت متأكد من حذف سجل أمانة «${d.depositor_name}» نهائياً؟`)) return
    const { error } = await supabase.from('deposits').delete().eq('id', d.id)
    if (error) return notify('تعذّر حذف السجل')
    notify('✓ تم حذف السجل')
    load()
  }

  const pagedDeposits = deposits.slice((depPage - 1) * depPageSize, depPage * depPageSize)

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
      ['الاسم', 'الهاتف', 'الرقم الوظيفي', 'الجهة', 'لوحة السيارة', 'الغاية', 'ملاحظات', 'الحارس المناوب', 'وقت الدخول', 'وقت الخروج', 'حارس الخروج', 'المدة'],
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
        v.exit_guard?.name || '',
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
        <div className="stat">
          <div className="num">{depositsHeld.length}</div>
          <div className="lbl">أمانات نشطة</div>
        </div>
        <div className="stat">
          <div className="num">{depositsPending.length}</div>
          <div className="lbl">بانتظار موافقة التسليم</div>
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
            <select value={fGuard} onChange={(e) => setFGuard(e.target.value)}>
              <option value="">🛡 كل الحرس</option>
              {guards.map((g) => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </select>
            <select value={fPurpose} onChange={(e) => setFPurpose(e.target.value)}>
              <option value="">🎯 كل الغايات</option>
              {purposeOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">📌 كل الحالات</option>
              <option value="in">بالداخل</option>
              <option value="out">غادر</option>
            </select>
            <select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="">👥 كل الأنواع</option>
              <option value="guest">ضيف خارجي</option>
              <option value="staff">من فرق الوزارة والمديريات</option>
            </select>
            {hasFilters && (
              <button className="btn btn-ghost" onClick={clearFilters}>
                إلغاء الفلترة ({filtered.length} نتيجة)
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
                  <th>حارس الدخول</th>
                  <th>الدخول</th>
                  <th>الخروج</th>
                  <th>حارس الخروج</th>
                  <th>المدة</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', color: 'var(--stone)' }}>
                      لا توجد نتائج
                    </td>
                  </tr>
                ) : (
                  pagedFiltered.map((v) => (
                    <Fragment key={v.id}>
                      <tr>
                        <td style={{ fontWeight: 700 }}>{v.visitor_name}</td>
                        <td dir="ltr">{v.phone || v.employee_id || '—'}</td>
                        <td dir="ltr">{v.plate || '—'}</td>
                        <td>{v.purpose || '—'}</td>
                        <td style={{ whiteSpace: 'normal', minWidth: 140 }}>{v.notes || '—'}</td>
                        <td>{v.guards?.name || '—'}</td>
                        <td>{fmtDateTime(v.entered_at)}</td>
                        <td>{v.exited_at ? fmtDateTime(v.exited_at) : '—'}</td>
                        <td>{v.exit_guard?.name || '—'}</td>
                        <td>{duration(v.entered_at, v.exited_at)}</td>
                        <td>
                          {v.exited_at ? <span className="pill out">غادر</span> : <span className="pill in">بالداخل</span>}
                        </td>
                        <td>
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '5px 9px' }}
                              title="تعديل السطر"
                              onClick={() => openEdit(v)}
                            >
                              ✏️
                            </button>
                            <button className="btn btn-danger-ghost" title="حذف السطر" onClick={() => deleteVisit(v)}>
                              🗑
                            </button>
                          </span>
                        </td>
                      </tr>
                      {edit && edit.id === v.id && (
                        <tr className="edit-row">
                          <td colSpan={12}>
                            <form className="edit-form" onSubmit={saveEdit}>
                              <div className="field">
                                <label>الاسم *</label>
                                <input value={edit.visitor_name} onChange={(e) => setEdit({ ...edit, visitor_name: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>الهاتف</label>
                                <input dir="ltr" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>الرقم الوظيفي</label>
                                <input dir="ltr" value={edit.employee_id} onChange={(e) => setEdit({ ...edit, employee_id: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>الجهة</label>
                                <input value={edit.org} onChange={(e) => setEdit({ ...edit, org: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>لوحة السيارة</label>
                                <input dir="ltr" inputMode="numeric" value={edit.plate} onChange={(e) => setEdit({ ...edit, plate: e.target.value.replace(/\D/g, '') })} />
                              </div>
                              <div className="field">
                                <label>الغاية</label>
                                <input value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>ملاحظات</label>
                                <input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>وقت الدخول *</label>
                                <input type="datetime-local" lang="en" dir="ltr" value={edit.entered_at} onChange={(e) => setEdit({ ...edit, entered_at: e.target.value })} />
                              </div>
                              <div className="field">
                                <label>وقت الخروج</label>
                                <input type="datetime-local" lang="en" dir="ltr" value={edit.exited_at} onChange={(e) => setEdit({ ...edit, exited_at: e.target.value })} />
                              </div>
                              <div className="edit-actions">
                                <button className="btn btn-primary" type="submit">💾 حفظ التعديلات</button>
                                <button className="btn btn-ghost" type="button" onClick={() => setEdit(null)}>إلغاء</button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} setPageSize={setPageSize} />
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-head">
          <h2>الأمانات</h2>
          <span className="badge">{deposits.length}</span>
        </div>
        <div className="card-body">
          {depositsPending.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--damask)', marginBottom: 8 }}>
                ⏳ طلبات تسليم بانتظار الموافقة ({depositsPending.length})
              </p>
              {depositsPending.map((d) => (
                <div className="deposit-item" key={d.id}>
                  <div className="info">
                    <div className="name">
                      <span className="dot" />
                      {d.depositor_name}
                    </div>
                    <div className="meta">
                      <span>📝 {d.description}</span>
                      <span>🕐 استُلمت {fmtDateTime(d.received_at)}</span>
                      {d.guards?.name && <span>🛡 استلمها: {d.guards.name}</span>}
                      <span>👤 تُسلَّم إلى: {d.receiver_name}</span>
                      <span>🕐 تاريخ التسليم: {fmtDateTime(d.delivered_at)}</span>
                      {d.delivery_guard?.name && <span>🛡 طلب التسليم: {d.delivery_guard.name}</span>}
                    </div>
                  </div>
                  <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-gold" style={{ padding: '8px 16px', fontSize: 13.5 }} onClick={() => approveDeposit(d)}>
                      ✅ موافقة
                    </button>
                    <button className="btn btn-danger-ghost" onClick={() => rejectDeposit(d)}>
                      ↩️ رفض
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>صاحب الأمانة</th>
                  <th>الوصف</th>
                  <th>استلمها (حارس)</th>
                  <th>تاريخ الاستلام</th>
                  <th>الحالة</th>
                  <th>المستلم</th>
                  <th>تاريخ التسليم</th>
                  <th>حارس التسليم</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--stone)' }}>
                      لا توجد سجلات أمانات
                    </td>
                  </tr>
                ) : (
                  pagedDeposits.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700 }}>{d.depositor_name}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 140 }}>{d.description}</td>
                      <td>{d.guards?.name || '—'}</td>
                      <td>{fmtDateTime(d.received_at)}</td>
                      <td>
                        {d.status === 'held' && <span className="pill in">نشطة</span>}
                        {d.status === 'pending' && <span className="pill pending">بانتظار الموافقة</span>}
                        {d.status === 'delivered' && <span className="pill out">تم التسليم</span>}
                      </td>
                      <td>{d.receiver_name || '—'}</td>
                      <td>{d.delivered_at ? fmtDateTime(d.delivered_at) : '—'}</td>
                      <td>{d.delivery_guard?.name || '—'}</td>
                      <td>
                        <button className="btn btn-danger-ghost" title="حذف السجل" onClick={() => deleteDeposit(d)}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={depPage} setPage={setDepPage} totalItems={deposits.length} pageSize={depPageSize} setPageSize={setDepPageSize} />
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
              <div key={g.id}>
                <div className="guard-row">
                  <span className={`g-name ${g.active ? '' : 'inactive'}`}>
                    🛡 {g.name}
                    {g.username && <small style={{ color: 'var(--teal)', marginInlineStart: 8 }} dir="ltr">@{g.username}</small>}
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => openAccount(g)}>
                      🔑 {g.username ? 'تعديل الحساب' : 'إنشاء حساب'}
                    </button>
                    <button className="btn btn-danger-ghost" onClick={() => toggleGuard(g)}>
                      {g.active ? 'إيقاف' : 'تفعيل'}
                    </button>
                  </span>
                </div>
                {accId === g.id && (
                  <form className="acc-form" onSubmit={saveAccount}>
                    <input placeholder="اسم المستخدم" dir="ltr" value={accUser} onChange={(e) => setAccUser(e.target.value)} />
                    <input placeholder="كلمة المرور الجديدة" dir="ltr" value={accPass} onChange={(e) => setAccPass(e.target.value)} />
                    <button className="btn btn-gold" style={{ padding: '8px 16px', fontSize: 13.5 }}>حفظ</button>
                  </form>
                )}
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
            <h2>القوائم المنسدلة</h2>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 12 }}>
              عدّل الخيارات بحرية — خيار واحد في كل سطر، ثم اضغط حفظ. التعديل يظهر فوراً في واجهة الحارس.
            </p>
            {Object.keys(LIST_LABELS).map((key) => (
              <div className="field" key={key}>
                <label>{LIST_LABELS[key]}</label>
                <textarea
                  rows={4}
                  value={listTexts[key]}
                  onChange={(e) => setListTexts({ ...listTexts, [key]: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ padding: '7px 16px', fontSize: 13, marginTop: 6 }}
                  onClick={() => saveList(key)}
                >
                  حفظ القائمة
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid section-gap">
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
