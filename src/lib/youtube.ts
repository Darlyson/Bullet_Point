/** Converte um link do YouTube (vídeo, shorts, live ou playlist) em URL de embed. */
export function toYouTubeEmbed(input: string): string | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null

  const list = u.searchParams.get('list')
  let id: string | null = null

  if (u.hostname.endsWith('youtu.be')) {
    id = u.pathname.slice(1) || null
  } else if (/^\/(shorts|embed|live)\//.test(u.pathname)) {
    id = u.pathname.split('/')[2] || null
  } else {
    id = u.searchParams.get('v')
  }

  if (id) return `https://www.youtube.com/embed/${id}${list ? `?list=${list}` : ''}`
  if (list) return `https://www.youtube.com/embed/videoseries?list=${list}`
  return null
}
