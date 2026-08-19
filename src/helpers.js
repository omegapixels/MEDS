export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('ar-SY-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—'

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('ar-SY-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'

export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—')

export const duration = (a, b) => {
  if (!a) return '—'
  const ms = (b ? new Date(b) : new Date()) - new Date(a)
  const m = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} س ${m % 60} د` : `${m} د`
}

export const todayISO = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
