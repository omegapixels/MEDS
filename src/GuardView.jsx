import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'
import { fmtDateTime, duration } from './helpers.js'

// طابور المزامنة الأوفلاين — يُحفظ محلياً ويُرفع عند توفر الاتصال بالتوقيت الحقيقي
const readQueue = () => {
  try {
    return JSON.parse(localStorage.getItem('meds_queue') || '[]')
  } catch {
    return []
  }
}
const writeQueue = (q) => localStorage.setItem('meds_queue', JSON.stringify(q))
const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

export default function GuardView() {
  const [guard, setGuard] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('meds_guard') || 'null')
    } catch {
      return null
    }
  })
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [active, setActive] = useState([])
  const [pending, setPending] = useState(readQueue())
  const [online, setOnline] = useState(navigator.onLine)
  const [vtype, setVtype] = useState('guest')
  const [bulk, setBulk] = useState(false)
  const [form, setForm] = useState({
    visitor_name: '', names: '', phone: '', plate: '', purpose: '', training_dept: '', notes: '',
    employee_id: '', org: '',
  })

  const ORGS = [
    'وزارة الطوارئ وإدارة الكوارث (المركز)',
    'مديرية طوارئ دمشق',
    'مديرية طوارئ ريف دمشق',
    'مديرية طوارئ حلب',
    'مديرية طوارئ حمص',
    'مديرية طوارئ حماة',
    'مديرية طوارئ اللاذقية',
    'مديرية طوارئ طرطوس',
    'مديرية طوارئ إدلب',
    'مديرية طوارئ دير الزور',
    'مديرية طوارئ الرقة',
    'مديرية طوارئ الحسكة',
    'مديرية طوارئ درعا',
    'مديرية طوارئ السويداء',
    'مديرية طوارئ القنيطرة',
    'أخرى',
  ]

  const PURPOSES = ['تدريب', 'مسابقة', 'مراجعة', 'طلب', 'أخرى']
  const TRAINING_DEPTS = ['دائرة التمكين', 'دائرة الحماية المدنية', 'دائرة التنمية الإدارية', 'أخرى']
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const notify = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3200)
  }

  const load = useCallback(async () => {
    if (!navigator.onLine) return
    const v = await supabase
      .from('visits')
      .select('*, guards(name)')
      .is('exited_at', null)
      .order('entered_at', { ascending: false })
    if (!v.error) setActive(v.data)
  }, [])

  // مزامنة الطابور: ترفع الإدخالات والمغادرات المعلقة بتوقيتها الحقيقي
  const flush = useCallback(async () => {
    if (!navigator.onLine) return
    let q = readQueue()
    if (!q.length) return
    let changed = false
    for (const op of [...q]) {
      let ok = false
      if (op.type === 'insert') {
        const { error } = await supabase.from('visits').insert(op.record)
        ok = !error || error.code === '23505' // مُدخل سابقاً
      } else if (op.type === 'exit') {
        const { error } = await supabase.from('visits').update({ exited_at: op.exited_at }).eq('id', op.id)
        ok = !error
      }
      if (!ok) break
      q = q.filter((x) => x !== op)
      changed = true
    }
    if (changed) {
      writeQueue(q)
      setPending(q)
      load()
      if (!q.length) notify('✓ تمت مزامنة جميع البيانات المعلقة')
    }
  }, [load])

  useEffect(() => {
    load()
    flush()
    const t = setInterval(() => {
      load()
      flush()
    }, 15000)
    const onOnline = () => {
      setOnline(true)
      flush()
      load()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [load, flush])

  const guardLogin = async (e) => {
    e.preventDefault()
    setLoginErr('')
    const { data, error } = await supabase
      .from('guards')
      .select('id, name, active')
      .eq('username', loginUser.trim())
      .eq('password', loginPass)
      .maybeSingle()
    if (error || !data) return setLoginErr('اسم المستخدم أو كلمة المرور غير صحيحة (يتطلب الدخول اتصالاً بالإنترنت)')
    if (!data.active) return setLoginErr('هذا الحساب موقوف — راجع المدير')
    const session = { id: data.id, name: data.name }
    localStorage.setItem('meds_guard', JSON.stringify(session))
    setGuard(session)
    setLoginUser('')
    setLoginPass('')
  }

  const guardLogout = () => {
    localStorage.removeItem('meds_guard')
    setGuard(null)
  }

  const saveRecords = async (records) => {
    setSaving(true)
    let queued = false
    if (navigator.onLine) {
      const { error } = await supabase.from('visits').insert(records)
      if (error) queued = true
    } else {
      queued = true
    }
    if (queued) {
      const q = readQueue()
      records.forEach((r) => q.push({ type: 'insert', record: r }))
      writeQueue(q)
      setPending(q)
    }
    setSaving(false)
    setForm((f) => ({
      ...f, visitor_name: '', names: '', phone: '', plate: '', purpose: '', training_dept: '', notes: '',
      employee_id: '', org: '',
    }))
    notify(
      queued
        ? `📴 حُفظ ${records.length > 1 ? records.length + ' تسجيلات' : 'التسجيل'} محلياً وسيُرفع تلقائياً عند الاتصال`
        : `✓ تم تسجيل الدخول بنجاح${records.length > 1 ? ` (${records.length} أشخاص)` : ''}`
    )
    load()
  }

  const submit = async (e) => {
    e.preventDefault()
    const names = bulk
      ? form.names.split('\n').map((n) => n.trim()).filter(Boolean)
      : [form.visitor_name.trim()].filter(Boolean)
    if (!names.length) return notify(bulk ? 'أدخل اسماً واحداً على الأقل' : 'الاسم إلزامي')
    let base
    if (vtype === 'staff') {
      if (!form.org) return notify('اختر الوزارة أو المديرية')
      base = {
        visitor_type: 'staff',
        employee_id: !bulk ? form.employee_id.trim() || null : null,
        plate: !bulk ? form.plate.trim() || null : null,
        org: form.org,
        purpose: `موظف — ${form.org}`,
        notes: form.notes.trim() || null,
        guard_id: guard.id,
      }
    } else {
      if (!form.purpose) return notify('اختر الغاية من الزيارة')
      if (form.purpose === 'تدريب' && !form.training_dept) return notify('اختر الدائرة المعنية بالتدريب')
      if (!form.notes.trim()) return notify('خانة الملاحظات إجبارية')
      base = {
        visitor_type: 'guest',
        phone: !bulk ? form.phone.trim() || null : null,
        plate: !bulk ? form.plate.trim() || null : null,
        purpose: form.purpose === 'تدريب' ? `تدريب — ${form.training_dept}` : form.purpose,
        notes: form.notes.trim(),
        guard_id: guard.id,
      }
    }
    const now = new Date().toISOString()
    const records = names.map((n) => ({ id: uuid(), visitor_name: n, entered_at: now, ...base }))
    await saveRecords(records)
  }

  const exitVisitor = async (id, name) => {
    const exited_at = new Date().toISOString()
    const q = readQueue()
    // إن كان التسجيل نفسه ما يزال معلقاً محلياً، نضيف وقت الخروج إليه مباشرة
    const queuedInsert = q.find((op) => op.type === 'insert' && op.record.id === id)
    if (queuedInsert) {
      queuedInsert.record.exited_at = exited_at
      writeQueue(q)
      setPending([...q])
      notify(`✓ سُجّل خروج ${name} (سيُرفع عند الاتصال)`)
      return
    }
    if (navigator.onLine) {
      const { error } = await supabase.from('visits').update({ exited_at }).eq('id', id)
      if (!error) {
        notify(`✓ تم تسجيل خروج ${name}`)
        load()
        return
      }
    }
    q.push({ type: 'exit', id, exited_at })
    writeQueue(q)
    setPending([...q])
    setActive((a) => a.filter((v) => v.id !== id))
    notify(`📴 سُجّل خروج ${name} محلياً وسيُرفع عند الاتصال`)
  }

  // القائمة المعروضة = تسجيلات الخادم + المعلقة محلياً (غير المغادرة)
  const pendingActive = pending
    .filter((op) => op.type === 'insert' && !op.record.exited_at)
    .map((op) => ({ ...op.record, _pending: true }))
  const pendingExits = new Set(pending.filter((op) => op.type === 'exit').map((op) => op.id))
  const shownActive = [
    ...pendingActive,
    ...active.filter((v) => !pendingExits.has(v.id) && !pendingActive.some((p) => p.id === v.id)),
  ]

  if (!guard) {
    return (
      <div className="card lock">
        <div className="card-head">
          <h2>تسجيل دخول الحارس</h2>
        </div>
        <div className="card-body">
          <div className="icon">🛡</div>
          <form onSubmit={guardLogin}>
            <div className="field">
              <label>اسم المستخدم</label>
              <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} dir="ltr" autoFocus required />
            </div>
            <div className="field">
              <label>كلمة المرور</label>
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required />
            </div>
            {loginErr && <p style={{ color: 'var(--damask)', fontSize: 13.5, marginBottom: 10 }}>{loginErr}</p>}
            <button className="btn btn-primary">دخول</button>
          </form>
          <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--stone)', textAlign: 'center' }}>
            لا تملك حساباً؟ اطلب من المدير إنشاءه لك
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="guard-bar">
        <span>
          🛡 الحارس المناوب: <b>{guard.name}</b>
          {!online && <span className="offline-pill">📴 دون اتصال</span>}
          {online && pending.length > 0 && <span className="offline-pill sync">⏳ جارٍ مزامنة {pending.length}</span>}
          {!online && pending.length > 0 && <span className="offline-pill">{pending.length} بانتظار الرفع</span>}
        </span>
        <button className="btn btn-exit" onClick={guardLogout}>
          تسجيل الخروج
        </button>
      </div>
    <div className="grid">
      <div className="card">
        <div className="card-head">
          <h2>تسجيل دخول زائر</h2>
        </div>
        <div className="card-body">
          <div className="vtype-switch">
            <button
              type="button"
              className={`vtype-btn ${vtype === 'guest' ? 'active' : ''}`}
              onClick={() => setVtype('guest')}
            >
              👤 ضيف خارجي
            </button>
            <button
              type="button"
              className={`vtype-btn ${vtype === 'staff' ? 'active' : ''}`}
              onClick={() => setVtype('staff')}
            >
              🎖 من فرق الوزارة والمديريات
            </button>
          </div>
          <label className="bulk-toggle">
            <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} />
            <span>👥 إدخال جماعي (مجموعة أشخاص بنفس البيانات)</span>
          </label>
          <form onSubmit={submit}>
            {bulk ? (
              <div className="field">
                <label>
                  أسماء الأشخاص — اسم واحد في كل سطر <span className="req">*</span>
                </label>
                <textarea
                  rows={6}
                  value={form.names}
                  onChange={(e) => setForm({ ...form, names: e.target.value })}
                  placeholder={'أحمد محمد\nخالد علي\nسمير حسن\n…'}
                  required
                />
                {form.names.trim() && (
                  <small style={{ color: 'var(--teal)', fontSize: 12.5 }}>
                    سيتم تسجيل {form.names.split('\n').filter((n) => n.trim()).length} شخصاً بنفس البيانات أدناه
                  </small>
                )}
              </div>
            ) : (
              <div className="field">
                <label>
                  الاسم الكامل <span className="req">*</span>
                </label>
                <input
                  value={form.visitor_name}
                  onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
                  placeholder="اسم الزائر الثلاثي"
                  required
                />
              </div>
            )}
            {vtype === 'staff' && (
              <>
                {!bulk && (
                  <div className="field">
                    <label>الرقم الوظيفي</label>
                    <input
                      value={form.employee_id}
                      onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                      placeholder="اختياري"
                      dir="ltr"
                    />
                  </div>
                )}
                <div className="field">
                  <label>
                    الوزارة / المديرية <span className="req">*</span>
                  </label>
                  <select value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} required>
                    <option value="">— اختر الجهة —</option>
                    {ORGS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {vtype === 'guest' && !bulk && (
              <div className="field">
                <label>رقم الهاتف</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="09XXXXXXXX (اختياري)"
                  inputMode="tel"
                />
              </div>
            )}
            {!bulk && (
              <div className="field">
                <label>لوحة السيارة</label>
                <input
                  value={form.plate}
                  onChange={(e) => setForm({ ...form, plate: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="أرقام فقط (اختياري)"
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>
            )}
            {vtype === 'guest' && (
            <div className="field">
              <label>
                الغاية من الزيارة <span className="req">*</span>
              </label>
              <select
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value, training_dept: '' })}
                required
              >
                <option value="">— اختر الغاية —</option>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            )}
            {vtype === 'guest' && form.purpose === 'تدريب' && (
              <div className="field">
                <label>
                  الدائرة المعنية بالتدريب <span className="req">*</span>
                </label>
                <select
                  value={form.training_dept}
                  onChange={(e) => setForm({ ...form, training_dept: e.target.value })}
                  required
                >
                  <option value="">— اختر الدائرة —</option>
                  {TRAINING_DEPTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>
                ملاحظات {vtype === 'guest' && <span className="req">*</span>}
              </label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={vtype === 'guest' ? 'ملاحظات الحارس حول الزيارة' : 'اختياري'}
                required={vtype === 'guest'}
              />
            </div>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'جارٍ التسجيل…' : bulk ? '👥 تسجيل الدخول الجماعي' : 'تسجيل الدخول الآن'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>المتواجدون حالياً داخل المديرية</h2>
          <span className="badge">{shownActive.length}</span>
        </div>
        <div className="card-body">
          {shownActive.length === 0 ? (
            <div className="empty">لا يوجد زوار داخل المديرية حالياً</div>
          ) : (
            shownActive.map((v) => (
              <div className="person" key={v.id}>
                <div className="info">
                  <div className="name">
                    <span className="dot" />
                    {v.visitor_name}
                    {v._pending && <span className="pending-tag">⏳ بانتظار المزامنة</span>}
                  </div>
                  <div className="meta">
                    {v.phone && <span>📞 {v.phone}</span>}
                    {v.employee_id && <span>🆔 {v.employee_id}</span>}
                    {v.org && <span>🏛 {v.org}</span>}
                    {v.plate && <span>🚗 {v.plate}</span>}
                    <span>🕐 دخل {fmtDateTime(v.entered_at)}</span>
                    <span>⏱ منذ {duration(v.entered_at)}</span>
                    {v.guards?.name && <span>🛡 {v.guards.name}</span>}
                  </div>
                </div>
                <button className="btn btn-exit" onClick={() => exitVisitor(v.id, v.visitor_name)}>
                  مغادرة
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
    </div>
  )
}
