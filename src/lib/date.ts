/** Datas sempre no fuso local, formato YYYY-MM-DD. */
export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Lista dos últimos N dias terminando hoje (mais antigo primeiro). */
export function lastNDays(n: number, end: string = toISODate()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)))
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatMinutes(totalSec: number): string {
  const min = Math.round(totalSec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`
}

const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const longFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

export const weekdayShort = (iso: string) => weekdayFmt.format(parseISODate(iso)).replace('.', '')
export const dateLong = (iso: string) => longFmt.format(parseISODate(iso))
export const dateShort = (iso: string) => shortFmt.format(parseISODate(iso))

export const uid = () => crypto.randomUUID()

/** Horário de um evento: "09:00–10:00", "09:00" ou "" (dia inteiro). */
export function timeLabel(b: { time?: string; endTime?: string }): string {
  if (!b.time) return ''
  return b.endTime ? `${b.time}–${b.endTime}` : b.time
}
