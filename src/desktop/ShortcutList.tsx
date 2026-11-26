import { useEffect, useState } from 'react'
import { isDesktop } from '../lib/desktop'

interface Info {
  keys: string
  action: string
  ok: boolean
}

/** Atalhos globais do app desktop (definidos em src-tauri/src/desktop.rs). */
export default function ShortcutList() {
  const [list, setList] = useState<Info[]>([])

  useEffect(() => {
    if (!isDesktop()) return
    void (async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      setList(await invoke<Info[]>('shortcut_status').catch(() => []))
    })()
  }, [])

  if (list.length === 0) return null
  return (
    <div className="menu-section">
      <h4>Atalhos globais</h4>
      <small className="muted">Funcionam mesmo com o app na bandeja.</small>
      <div className="shortcut-list">
        {list.map((s) => (
          <div key={s.keys} style={{ display: 'contents' }}>
            <kbd>{s.keys}</kbd>
            <span
              className={s.ok ? '' : 'off'}
              title={s.ok ? undefined : 'Outro programa já usa essa combinação (na versão de teste: o app instalado).'}
            >
              {s.action}
              {!s.ok && ' — em uso por outro programa'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
