import { useCallback, useState } from 'react'
import ReactGridLayout, { noCompactor, useContainerWidth, verticalCompactor, type Layout } from 'react-grid-layout'
import { db, type GridItem, type Workspace } from '../db/db'
import { GRID_COLS, removeWindow } from '../lib/workspaces'
import { WINDOW_TYPES } from '../windows/registry'

/**
 * A "mesa" do app: cada janela pode ser arrastada pelo título e
 * redimensionada pelas bordas. Tudo encaixa numa grade de 24 colunas.
 */
export default function WorkspaceCanvas({ ws }: { ws: Workspace }) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [interacting, setInteracting] = useState(false)
  const [maxId, setMaxId] = useState<string | null>(null)

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      const next: GridItem[] = layout.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH }))
      if (JSON.stringify(next) !== JSON.stringify(ws.layout)) {
        void db.workspaces.update(ws.id, { layout: next })
      }
    },
    [ws.id, ws.layout],
  )

  const setConfig = (id: string, patch: Record<string, unknown>) => {
    void db.workspaces.update(ws.id, {
      windows: ws.windows.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)),
    })
  }

  const start = () => setInteracting(true)
  const stop = () => setInteracting(false)

  return (
    <div ref={containerRef} className={`canvas ${interacting ? 'interacting' : ''} ${ws.locked ? 'locked' : ''}`}>
      {ws.windows.length === 0 && (
        <div className="canvas-empty">
          Espaço vazio. Use <strong>+ Janela</strong> no topo para adicionar módulos.
        </div>
      )}
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={ws.layout}
          gridConfig={{ cols: GRID_COLS, rowHeight: 24, margin: [10, 10], containerPadding: [12, 12] }}
          dragConfig={{ enabled: !ws.locked, handle: '.win-header', cancel: '.no-drag' }}
          resizeConfig={{ enabled: !ws.locked, handles: ['se', 'e', 's', 'w'] }}
          compactor={ws.snap === 'auto' ? verticalCompactor : noCompactor}
          onLayoutChange={onLayoutChange}
          onDragStart={start}
          onDragStop={stop}
          onResizeStart={start}
          onResizeStop={stop}
        >
          {ws.windows.map((w) => {
            const type = WINDOW_TYPES[w.kind]
            const Comp = type.component
            const maximized = maxId === w.id
            return (
              <div key={w.id} className={`win ${maximized ? 'win-max' : ''}`}>
                <header className="win-header" onDoubleClick={() => setMaxId(maximized ? null : w.id)}>
                  <span className="win-icon">{type.icon}</span>
                  <span className="win-title">{type.title}</span>
                  <span className="win-buttons no-drag">
                    <button
                      className="icon-btn ghost"
                      title={maximized ? 'Restaurar' : 'Maximizar'}
                      onClick={() => setMaxId(maximized ? null : w.id)}
                    >
                      {maximized ? '❐' : '□'}
                    </button>
                    <button
                      className="icon-btn ghost"
                      title="Fechar janela"
                      onClick={() => {
                        if (maximized) setMaxId(null)
                        void removeWindow(ws, w.id)
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </header>
                <div className="win-body">
                  <Comp win={w} setConfig={(p) => setConfig(w.id, p)} />
                </div>
              </div>
            )
          })}
        </ReactGridLayout>
      )}
      {maxId && <div className="max-backdrop" onClick={() => setMaxId(null)} />}
    </div>
  )
}
