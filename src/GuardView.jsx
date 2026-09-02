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
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    visitor_name: '', names: '', phone: '', plate: '', purpose: '', training_dept: '', homs_dept: '', notes: '',
    employee_id: '', org: '',
  })

  // ===== الأمانات =====
  const [deposits, setDeposits] = useState([])
  const [depForm, setDepForm] = useState({ depositor_name: '', description: '', plate: '' })
  const [depSaving, setDepSaving] = useState(false)
  const [deliverId, setDeliverId] = useState(null)
  const [receiverName, setReceiverName] = useState('')
  const [deliverPlate, setDeliverPlate] = useState('')
  const [depSearch, setDepSearch] = useState('')

  // القوائم المنسدلة قابلة للتعديل من صفحة المدير — تُحمّل من قاعدة البيانات مع نسخة محلية للأوفلاين
  const DEFAULT_LISTS = {
    list_purposes: ['تدريب', 'مسابقة', 'مراجعة', 'طلب', 'زيارة أو اجتماع', 'أخرى'],
    list_homs_depts: ['مكتب المدير', 'الديوان العام', 'دائرة التمكين', 'دائرة الحماية المدنية', 'دائرة التنمية الإدارية', 'دائرة الموارد البشرية', 'دائرة الشؤون المالية', 'دائرة الشؤون القانونية', 'دائرة العمليات', 'دائرة التخطيط والتعاون الدولي', 'دائرة الخدمات واللوجستيات', 'دائرة الإعلام والتوعية', 'دائرة تقانة المعلومات', 'دائرة الرصد والإنذار المبكر', 'دائرة الإسعاف والطبابة', 'دائرة الإطفاء', 'أخرى'],
    list_training_depts: ['دائرة التمكين', 'دائرة الحماية المدنية', 'دائرة التنمية الإدارية', 'أخرى'],
    list_orgs: ['وزارة الطوارئ وإدارة الكوارث (المركز)', 'مديرية طوارئ حمص', 'أخرى'],
  }
  const [lists, setLists] = useState(() => {
    try {
      return { ...DEFAULT_LISTS, ...JSON.parse(localStorage.getItem('meds_lists') || '{}') }
    } catch {
      return DEFAULT_LISTS
    }
  })
  useEffect(() => {
    if (!navigator.onLine) return
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['list_purposes', 'list_training_depts', 'list_orgs', 'list_homs_depts'])
      .then(({ data }) => {
        if (!data?.length) return
        const next = { ...DEFAULT_LISTS }
        data.forEach((r) => {
          try {
            const arr = JSON.parse(r.value)
            if (Array.isArray(arr) && arr.length) next[r.key] = arr
          } catch { /* تجاهل القيم التالفة */ }
        })
        setLists(next)
        localStorage.setItem('meds_lists', JSON.stringify(next))
      })
  }, [])
  const ORGS = lists.list_orgs
  const PURPOSES = lists.list_purposes
  const TRAINING_DEPTS = lists.list_training_depts
  const HOMS_DEPTS = lists.list_homs_depts
  // الشروط تعتمد على «يحتوي» حتى تبقى صالحة لو عدّل المدير أسماء الغايات (تدريب/تدريبات، زيارة، اجتماع…)
  const isTraining = (p) => (p || '').includes('تدريب')
  const isMeeting = (p) => (p || '').includes('زيارة') || (p || '').includes('اجتماع')
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

  const loadDeposits = useCallback(async () => {
    if (!navigator.onLine) return
    const d = await supabase
      .from('deposits')
      .select('*, guards!deposits_guard_id_fkey(name), delivery_guard:guards!deposits_delivery_guard_id_fkey(name)')
      .in('status', ['held', 'pending'])
      .order('received_at', { ascending: false })
    if (!d.error) setDeposits(d.data)
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
        const { error } = await supabase
          .from('visits')
          .update({ exited_at: op.exited_at, exit_guard_id: op.exit_guard_id })
          .eq('id', op.id)
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
    loadDeposits()
    flush()
    const t = setInterval(() => {
      load()
      loadDeposits()
      flush()
    }, 15000)
    const onOnline = () => {
      setOnline(true)
      flush()
      load()
      loadDeposits()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [load, loadDeposits, flush])

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
      ...f, visitor_name: '', names: '', phone: '', plate: '', purpose: '', training_dept: '', homs_dept: '', notes: '',
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
      if (isTraining(form.purpose) && !form.training_dept) return notify('اختر الدائرة المعنية بالتدريب')
      if (isMeeting(form.purpose) && !form.homs_dept) return notify('اختر الدائرة المقصودة بالزيارة')
      if (!form.notes.trim()) return notify('خانة الملاحظات إجبارية')
      base = {
        visitor_type: 'guest',
        phone: !bulk ? form.phone.trim() || null : null,
        plate: !bulk ? form.plate.trim() || null : null,
        purpose: isTraining(form.purpose)
          ? `${form.purpose} — ${form.training_dept}`
          : isMeeting(form.purpose)
            ? `${form.purpose} — ${form.homs_dept}`
            : form.purpose,
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
    // إن كان التسجيل نفسه ما يزال معلقاً محلياً، نضيف وقت الخروج وحارس الخروج إليه مباشرة
    const queuedInsert = q.find((op) => op.type === 'insert' && op.record.id === id)
    if (queuedInsert) {
      queuedInsert.record.exited_at = exited_at
      queuedInsert.record.exit_guard_id = guard.id
      writeQueue(q)
      setPending([...q])
      notify(`✓ سُجّل خروج ${name} بواسطتك (سيُرفع عند الاتصال)`)
      return
    }
    if (navigator.onLine) {
      const { error } = await supabase
        .from('visits')
        .update({ exited_at, exit_guard_id: guard.id })
        .eq('id', id)
      if (!error) {
        notify(`✓ تم تسجيل خروج ${name} بواسطتك`)
        load()
        return
      }
    }
    q.push({ type: 'exit', id, exited_at, exit_guard_id: guard.id })
    writeQueue(q)
    setPending([...q])
    setActive((a) => a.filter((v) => v.id !== id))
    notify(`📴 سُجّل خروج ${name} محلياً وسيُرفع عند الاتصال`)
  }

  // ===== الأمانات =====
  const receiveDeposit = async (e) => {
    e.preventDefault()
    if (!depForm.depositor_name.trim()) return notify('اسم صاحب الأمانة إلزامي')
    if (!depForm.description.trim()) return notify('وصف الأمانة إلزامي')
    if (!navigator.onLine) return notify('📴 تسجيل الأمانات يتطلب اتصالاً بالإنترنت')
    setDepSaving(true)
    const { error } = await supabase.from('deposits').insert({
      depositor_name: depForm.depositor_name.trim(),
      description: depForm.description.trim(),
      plate: depForm.plate.trim() || null,
      guard_id: guard.id,
      received_at: new Date().toISOString(),
      status: 'held',
    })
    setDepSaving(false)
    if (error) return notify('تعذّر تسجيل الأمانة')
    setDepForm({ depositor_name: '', description: '', plate: '' })
    notify('✓ تم تسجيل استلام الأمانة')
    loadDeposits()
  }

  const openDeliver = (dep) => {
    setDeliverId(dep.id === deliverId ? null : dep.id)
    setReceiverName('')
    setDeliverPlate('')
  }

  const submitDeliver = async (e, dep) => {
    e.preventDefault()
    if (!receiverName.trim()) return notify('اسم المستلم إلزامي')
    if (!navigator.onLine) return notify('📴 تسليم الأمانات يتطلب اتصالاً بالإنترنت')
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('deposits')
      .update({
        receiver_name: receiverName.trim(),
        delivery_plate: deliverPlate.trim() || null,
        delivery_guard_id: guard.id,
        delivery_requested_at: now,
        delivered_at: now,
        status: 'pending',
      })
      .eq('id', dep.id)
    if (error) return notify('تعذّر إرسال طلب التسليم')
    setDeliverId(null)
    notify('✓ أُرسل طلب التسليم إلى المدير للموافقة')
    loadDeposits()
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

  // تصفية القائمة حسب نص البحث (الاسم، الهاتف، الجهة، الرقم الوظيفي)
  const searchNorm = search.trim().toLowerCase()
  const filteredActive = searchNorm
    ? shownActive.filter((v) =>
        [v.visitor_name, v.phone, v.org, v.employee_id, v.plate]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(searchNorm))
      )
    : shownActive

  const depSearchNorm = depSearch.trim().toLowerCase()
  const filteredDeposits = depSearchNorm
    ? deposits.filter((d) =>
        [d.depositor_name, d.description]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(depSearchNorm))
      )
    : deposits

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
                onChange={(e) => setForm({ ...form, purpose: e.target.value, training_dept: '', homs_dept: '' })}
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
            {vtype === 'guest' && isMeeting(form.purpose) && (
              <div className="field">
                <label>
                  الدائرة المقصودة بالزيارة <span className="req">*</span>
                </label>
                <select
                  value={form.homs_dept}
                  onChange={(e) => setForm({ ...form, homs_dept: e.target.value })}
                  required
                >
                  <option value="">— اختر الدائرة —</option>
                  {HOMS_DEPTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {vtype === 'guest' && isTraining(form.purpose) && (
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
          <span className="badge">{filteredActive.length}</span>
        </div>
        <div className="card-body">
          <div className="field" style={{ marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 ابحث بالاسم، الهاتف، الجهة، أو الرقم الوظيفي…"
            />
          </div>
          {shownActive.length === 0 ? (
            <div className="empty">لا يوجد زوار داخل المديرية حالياً</div>
          ) : filteredActive.length === 0 ? (
            <div className="empty">لا توجد نتائج مطابقة للبحث</div>
          ) : (
            filteredActive.map((v) => (
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
    </div>

    <div className="grid section-gap">
      <div className="card">
        <div className="card-head">
          <h2>📦 استلام أمانة</h2>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 12 }}>
            سُجَّل تاريخ الاستلام تلقائياً بلحظة إدخال البيانات. تبقى الأمانة نشطة داخل المديرية حتى يُطلب تسليمها وتتم موافقة المدير.
          </p>
          <form onSubmit={receiveDeposit}>
            <div className="field">
              <label>
                اسم صاحب الأمانة <span className="req">*</span>
              </label>
              <input
                value={depForm.depositor_name}
                onChange={(e) => setDepForm({ ...depForm, depositor_name: e.target.value })}
                placeholder="اسم الشخص الذي سلّم الأمانة"
                required
              />
            </div>
            <div className="field">
              <label>
                وصف الأمانة <span className="req">*</span>
              </label>
              <textarea
                rows={2}
                value={depForm.description}
                onChange={(e) => setDepForm({ ...depForm, description: e.target.value })}
                placeholder="نوع الأمانة ومواصفاتها (مثال: هوية شخصية، مفتاح سيارة، ظرف مستندات…)"
                required
              />
            </div>
            <div className="field">
              <label>لوحة السيارة (اختياري)</label>
              <input
                value={depForm.plate}
                onChange={(e) => setDepForm({ ...depForm, plate: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="أرقام فقط (اختياري)"
                inputMode="numeric"
                dir="ltr"
              />
            </div>
            <button className="btn btn-primary" disabled={depSaving}>
              {depSaving ? 'جارٍ التسجيل…' : '📦 تسجيل استلام الأمانة'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>الأمانات النشطة</h2>
          <span className="badge">{filteredDeposits.length}</span>
        </div>
        <div className="card-body">
          <div className="field" style={{ marginBottom: 12 }}>
            <input
              value={depSearch}
              onChange={(e) => setDepSearch(e.target.value)}
              placeholder="🔍 ابحث باسم صاحب الأمانة أو وصفها…"
            />
          </div>
          {deposits.length === 0 ? (
            <div className="empty">لا توجد أمانات نشطة حالياً</div>
          ) : filteredDeposits.length === 0 ? (
            <div className="empty">لا توجد نتائج مطابقة للبحث</div>
          ) : (
            filteredDeposits.map((d) => (
              <div className="deposit-item" key={d.id}>
                <div className="info">
                  <div className="name">
                    <span className="dot" />
                    {d.depositor_name}
                    {d.status === 'pending' ? (
                      <span className="pill pending" style={{ marginInlineStart: 8 }}>⏳ بانتظار موافقة المدير</span>
                    ) : (
                      <span className="pill in" style={{ marginInlineStart: 8 }}>نشطة</span>
                    )}
                  </div>
                  <div className="meta">
                    <span>📝 {d.description}</span>
                    {d.plate && <span>🚗 {d.plate}</span>}
                    <span>🕐 استُلمت {fmtDateTime(d.received_at)}</span>
                    {d.guards?.name && <span>🛡 {d.guards.name}</span>}
                    {d.status === 'pending' && d.receiver_name && <span>👤 المستلم: {d.receiver_name}</span>}
                    {d.status === 'pending' && d.delivery_plate && <span>🚗 لوحة المستلم: {d.delivery_plate}</span>}
                    {d.status === 'pending' && d.delivery_guard?.name && <span>🛡 طلب التسليم: {d.delivery_guard.name}</span>}
                  </div>
                </div>
                {d.status === 'held' && (
                  <button className="btn btn-gold" style={{ padding: '8px 16px', fontSize: 13.5 }} onClick={() => openDeliver(d)}>
                    تسليم
                  </button>
                )}
                {d.status === 'held' && deliverId === d.id && (
                  <form className="acc-form" style={{ flexBasis: '100%' }} onSubmit={(e) => submitDeliver(e, d)}>
                    <input
                      placeholder="اسم مستلم الأمانة"
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      autoFocus
                    />
                    <input
                      placeholder="لوحة السيارة (اختياري)"
                      value={deliverPlate}
                      onChange={(e) => setDeliverPlate(e.target.value.replace(/[^0-9]/g, ''))}
                      inputMode="numeric"
                      dir="ltr"
                    />
                    <button className="btn btn-gold" style={{ padding: '8px 16px', fontSize: 13.5 }}>
                      إرسال طلب التسليم
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: 13.5 }} onClick={() => setDeliverId(null)}>
                      إلغاء
                    </button>
                  </form>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
