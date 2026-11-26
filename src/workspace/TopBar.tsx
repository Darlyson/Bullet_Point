import { useRef, useState } from 'react'
import { db, type WindowKind, type Workspace } from '../db/db'
import { addWindow, createWorkspace, organizeWorkspace } from '../lib/workspaces'
import { WINDOW_TYPES } from '../windows/registry'
import { useFocus } from '../focus/FocusContext'
import { formatDuration } from '../lib/date'
import { exportData, importData } from '../lib/backup'
import WindowControls from './WindowControls'
import ShortcutList from '../desktop/ShortcutList'
import { TopicSelect, useTopics } from '../components/topics'
import { useTopicFilter } from '../topics/context'

interface Props {
  workspaces: Workspace[]
  active: Workspace
  onSelect: (id: string) => void
}

export default function TopBar({ workspaces, active, onSelect }: Props) {
  const [menu, setMenu] = useState<'add' | 'data' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { state, elapsed, remaining } = useFocus()
  const filter = useTopicFilter()
  const filterTopic = useTopics().byId.get(filter.topicId)

  const hasWindow = (k: WindowKind) => active.windows.some((w) => w.kind === k)

  async function newWorkspace() {
    const name = prompt('Nome do novo espaço de trabalho:', 'Novo espaço')
    if (name?.trim()) onSelect(await createWorkspace(name.trim()))
  }

  async function rename(ws: Workspace) {
    const name = prompt('Renomear espaço:', ws.name)
    if (name?.trim()) await db.workspaces.update(ws.id, { name: name.trim() })
  }

  async function removeWs(ws: Workspace) {
    if (workspaces.length <= 1) return alert('Precisa existir pelo menos um espaço.')
    if (!confirm(`Excluir o espaço "${ws.name}"? (Seus dados não são apagados, só o layout.)`)) return
    await db.workspaces.delete(ws.id)
    onSelect(workspaces.find((w) => w.id !== ws.id)!.id)
  }

  async function doExport() {
    const blob = await exportData()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bullet-point-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMenu(null)
  }

  async function doImport(file: File) {
    if (!confirm('Importar vai SUBSTITUIR todos os dados atuais. Continuar?')) return
    try {
      await importData(file)
      location.reload()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  // Áreas com data-tauri-drag-region arrastam o app (clique duplo maximiza).
  return (
    <nav className="topbar" data-tauri-drag-region onMouseLeave={() => setMenu(null)}>
      <div className="brand" data-tauri-drag-region>◆ Bullet Point</div>
      {import.meta.env.DEV && (
        <span className="dev-badge" data-tauri-drag-region title="Versão de teste (npm run desktop / npm run dev). Os dados são separados do app instalado.">
          TESTE
        </span>
      )}

      <div className="tabs">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className={`tab ${ws.id === active.id ? 'active' : ''}`}
            onClick={() => onSelect(ws.id)}
            onDoubleClick={() => rename(ws)}
            onContextMenu={(e) => {
              e.preventDefault()
              void removeWs(ws)
            }}
            title="Clique duplo: renomear · Botão direito: excluir"
          >
            {ws.name}
          </button>
        ))}
        <button className="tab ghost" onClick={newWorkspace} title="Novo espaço de trabalho">
          +
        </button>
      </div>

      <div className="spacer" data-tauri-drag-region />

      <div
        className={`topic-filter ${filterTopic ? 'on' : ''}`}
        style={filterTopic ? { borderColor: filterTopic.color } : undefined}
      >
        {filterTopic && <span className="dot" style={{ background: filterTopic.color }} />}
        <TopicSelect allowAll value={filter.topicId} onChange={filter.setTopicId} title="Filtrar todas as janelas por tópico" />
        {filterTopic && (
          <button className="icon-btn ghost" title="Tirar o filtro" onClick={() => filter.setTopicId('')}>
            ✕
          </button>
        )}
      </div>

      {state.status !== 'idle' && (
        <div className={`mini-timer ${state.status}`} title={state.label}>
          ⏱ {formatDuration(remaining ?? elapsed)}
        </div>
      )}

      <div className="menu-wrap">
        <button className="primary" onClick={() => setMenu(menu === 'add' ? null : 'add')}>
          + Janela
        </button>
        {menu === 'add' && (
          <div className="menu">
            {(Object.keys(WINDOW_TYPES) as WindowKind[]).map((k) => {
              const t = WINDOW_TYPES[k]
              const disabled = t.single && hasWindow(k)
              return (
                <button
                  key={k}
                  disabled={disabled}
                  onClick={() => {
                    void addWindow(active, k)
                    setMenu(null)
                  }}
                >
                  <span className="win-icon">{t.icon}</span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>{disabled ? 'já está aberta' : t.description}</small>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button
        className="chip"
        onClick={() => organizeWorkspace(active)}
        title="Junta as janelas no topo, sem buracos nem sobreposições"
        disabled={active.locked}
      >
        ▦ Organizar
      </button>
      <button
        className={active.snap === 'auto' ? 'chip active' : 'chip'}
        onClick={() => db.workspaces.update(active.id, { snap: active.snap === 'auto' ? 'free' : 'auto' })}
        title="Livre: a janela fica onde você soltar. Auto: as janelas sobem e se empilham sozinhas."
      >
        {active.snap === 'auto' ? '⇧ Auto-encaixe' : '✥ Livre'}
      </button>
      <button
        className={active.locked ? 'chip active' : 'chip'}
        onClick={() => db.workspaces.update(active.id, { locked: !active.locked })}
        title="Travar o layout para não mover janelas sem querer"
      >
        {active.locked ? '🔒 Travado' : '🔓 Editar'}
      </button>

      <div className="menu-wrap">
        <button className="ghost" onClick={() => setMenu(menu === 'data' ? null : 'data')} title="Backup e atalhos">
          ⋯
        </button>
        {menu === 'data' && (
          <div className="menu right">
            <button onClick={doExport}>
              <span className="win-icon">⤓</span>
              <span>
                <strong>Exportar backup</strong>
                <small>Salva tudo num arquivo .json</small>
              </span>
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <span className="win-icon">⤒</span>
              <span>
                <strong>Importar backup</strong>
                <small>Substitui os dados atuais</small>
              </span>
            </button>
            <ShortcutList />
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
      </div>

      <WindowControls />
    </nav>
  )
}
