import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'
import { fmtTime, duration } from './helpers.js'

export default function GuardView() {
  const [guards, setGuards] = useState([])
  const [active, setActive] = useState([])
  const [form, setForm] = useState({ visitor_name: '', phone: '', purpose: '', guard_id: '' })
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
    if (!form.visitor_name.trim() || !form.phone.trim()) return notify('الاسم ورقم الهاتف إلزاميان')
    setSaving(true)
    const { error } = await supabase.from('visits').insert({
      visitor_name: form.visitor_name.trim(),
      phone: form.phone.trim(),
      purpose: form.purpose.trim() || null,
      guard_id: form.guard_id || null,
    })
    setSaving(false)
    if (error) return notify('حدث خطأ، حاول مجدداً')
    setForm((f) => ({ ...f, visitor_name: '', phone: '', purpose: '' }))
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
            <div className="field">
              <label>
                رقم الهاتف <span className="req">*</span>
              </label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="09XXXXXXXX"
                inputMode="tel"
                required
              />
            </div>
            <div className="field">
              <label>الغاية من الزيارة</label>
              <input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="اختياري"
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
                    <span>📞 {v.phone}</span>
                    <span>🕐 دخل {fmtTime(v.entered_at)}</span>
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
