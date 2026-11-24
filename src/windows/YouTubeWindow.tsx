import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useFocus } from '../focus/FocusContext'
import { toYouTubeEmbed } from '../lib/youtube'

/** O vídeo é compartilhado com o Foco: ao salvar uma sessão, o link fica registrado nela. */
export default function YouTubeWindow() {
  const { state, update } = useFocus()
  const [draft, setDraft] = useState(state.youtubeUrl)
  const embed = toYouTubeEmbed(state.youtubeUrl)

  const recent = useLiveQuery(async () => {
    const s = await db.focusSessions.orderBy('startedAt').reverse().limit(50).toArray()
    return [...new Set(s.map((x) => x.youtubeUrl).filter((u): u is string => !!u))].slice(0, 5)
  }, [])

  return (
    <div className="yt">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          update({ youtubeUrl: draft.trim() })
        }}
      >
        <input
          placeholder="Cole o link do vídeo ou playlist do YouTube"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          list="yt-recent"
        />
        <datalist id="yt-recent">
          {recent?.map((u) => <option key={u} value={u} />)}
        </datalist>
        <button type="submit">Abrir</button>
      </form>
      {embed ? (
        <iframe
          className="yt-frame"
          src={embed}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="yt-empty muted">
          {state.youtubeUrl ? 'Link do YouTube inválido.' : 'Nenhum vídeo. Cole um link acima.'}
        </div>
      )}
    </div>
  )
}
