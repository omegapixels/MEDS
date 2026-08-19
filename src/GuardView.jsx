import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'
import { fmtDateTime, duration } from './helpers.js'

export default function GuardView() {
  const [guards, setGuards] = useState([])
  const [active, setActive] = useState([])
  const [vtype, setVtype] = useState('guest')
  const [form, setForm] = useState({
    visitor_name: '', phone: '', plate: '', purpose: '', training_dept: '', notes: '', guard_id: '',
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
    setTimeout(() => setToast(''), 2600)
  }

  const load = useCallback(async () => {
    const [g, v] = await Promise.all([
      supabase.from('guards').select('*').eq('active', true).order('name'),
      supabase.from('visits').select('*, guards(name)').is('exited_at', null).order('entered_at', { ascending: false }),
    ])
    if (!g.error) setGuards(g.data)
    if (!v.error) setActive(v.data)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.visitor_name.trim()) return notify('الاسم إلزامي')
    let record
    if (vtype === 'staff') {
      if (!form.org) return notify('اختر الوزارة أو المديرية')
      record = {
        visitor_type: 'staff',
        visitor_name: form.visitor_name.trim(),
        employee_id: form.employee_id.trim() || null,
        plate: form.plate.trim() || null,
        org: form.org,
        purpose: `موظف — ${form.org}`,
        notes: form.notes.trim() || null,
        guard_id: form.guard_id || null,
      }
    } else {
      if (!form.purpose) return notify('اختر الغاية من الزيارة')
      if (form.purpose === 'تدريب' && !form.training_dept) return notify('اختر الدائرة المعنية بالتدريب')
      if (!form.notes.trim()) return notify('خانة الملاحظات إجبارية')
      record = {
        visitor_type: 'guest',
        visitor_name: form.visitor_name.trim(),
        phone: form.phone.trim() || null,
        plate: form.plate.trim() || null,
        purpose: form.purpose === 'تدريب' ? `تدريب — ${form.training_dept}` : form.purpose,
        notes: form.notes.trim(),
        guard_id: form.guard_id || null,
      }
    }
    setSaving(true)
    const { error } = await supabase.from('visits').insert(record)
    setSaving(false)
    if (error) return notify('حدث خطأ، حاول مجدداً')
    setForm((f) => ({
      ...f, visitor_name: '', phone: '', plate: '', purpose: '', training_dept: '', notes: '',
      employee_id: '', org: '',
    }))
    notify('✓ تم تسجيل الدخول بنجاح')
    load()
  }

  const exitVisitor = async (id, name) => {
    const { error } = await supabase.from('visits').update({ exited_at: new Date().toISOString() }).eq('id', id)
    if (error) return notify('تعذّر تسجيل الخروج')
    notify(`✓ تم تسجيل خروج ${name}`)
    load()
  }

  return (
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
          <form onSubmit={submit}>
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
            {vtype === 'staff' && (
              <>
                <div className="field">
                  <label>الرقم الوظيفي</label>
                  <input
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    placeholder="اختياري"
                    dir="ltr"
                  />
                </div>
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
            {vtype === 'guest' && (
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
            <div className="field">
              <label>الحارس المناوب</label>
              <select value={form.guard_id} onChange={(e) => setForm({ ...form, guard_id: e.target.value })}>
                <option value="">— اختر الحارس المناوب —</option>
                {guards.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'جارٍ التسجيل…' : 'تسجيل الدخول الآن'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>المتواجدون حالياً داخل المديرية</h2>
          <span className="badge">{active.length}</span>
        </div>
        <div className="card-body">
          {active.length === 0 ? (
            <div className="empty">لا يوجد زوار داخل المديرية حالياً</div>
          ) : (
            active.map((v) => (
              <div className="person" key={v.id}>
                <div className="info">
                  <div className="name">
                    <span className="dot" />
                    {v.visitor_name}
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
  )
}
