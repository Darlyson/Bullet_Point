import { useEffect, useState } from 'react'
import { isDesktop } from '../lib/desktop'

/**
 * Botões minimizar / maximizar / fechar do app desktop.
 *
 * O app não usa a barra de título do Windows (tauri.conf.json → decorations:
 * false): arrastar por ela às vezes não funcionava quando o foco estava na
 * página. A barra de cima do app faz esse papel: arraste pelas áreas vazias
 * (data-tauri-drag-region) e clique duplo para maximizar.
 */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isDesktop()) return
    let unlisten: (() => void) | undefined
    let alive = true
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const update = async () => alive && setMaximized(await win.isMaximized())
      await update()
      const off = await win.onResized(() => void update())
      if (alive) unlisten = off
      else off()
    })()
    return () => {
      alive = false
      unlisten?.()
    }
  }, [])

  if (!isDesktop()) return null

  const run = (action: 'minimize' | 'toggleMaximize' | 'close') => async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow()[action]()
  }

  return (
    <div className="win-controls">
      <button onClick={run('minimize')} title="Minimizar" aria-label="Minimizar">
        ─
      </button>
      <button onClick={run('toggleMaximize')} title={maximized ? 'Restaurar' : 'Maximizar'} aria-label={maximized ? 'Restaurar' : 'Maximizar'}>
        {maximized ? '❐' : '□'}
      </button>
      <button className="close" onClick={run('close')} title="Fechar" aria-label="Fechar">
        ✕
      </button>
    </div>
  )
}
