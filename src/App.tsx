import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { ensureDefaultWorkspaces } from './lib/workspaces'
import { showDesktopWindow } from './lib/desktop'
import { FocusProvider } from './focus/FocusContext'
import { TopicFilterProvider } from './topics/TopicFilter'
import TopBar from './workspace/TopBar'
import WorkspaceCanvas from './workspace/WorkspaceCanvas'

const ACTIVE_KEY = 'bp-active-workspace'

export default function App() {
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY) ?? '')

  useEffect(() => {
    void ensureDefaultWorkspaces()
  }, [])

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeId)
  }, [activeId])

  const workspaces = useLiveQuery(() => db.workspaces.orderBy('order').toArray(), [])
  const ready = !!workspaces && workspaces.length > 0

  // Desktop: só mostra a janela depois que a mesa foi desenhada (2 quadros).
  useEffect(() => {
    if (!ready) return
    requestAnimationFrame(() => requestAnimationFrame(() => void showDesktopWindow()))
  }, [ready])

  if (!workspaces || workspaces.length === 0) return <div className="loading">Carregando…</div>

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0]

  return (
    <TopicFilterProvider>
      <FocusProvider>
        <div className="app">
          <TopBar workspaces={workspaces} active={active} onSelect={setActiveId} />
          <WorkspaceCanvas key={active.id} ws={active} />
        </div>
      </FocusProvider>
    </TopicFilterProvider>
  )
}
