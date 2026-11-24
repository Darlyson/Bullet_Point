import { memo, useCallback, useEffect, useState } from 'react'
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from 'react-grid-layout'
import { db, type GridItem, type WindowInstance, type Workspace } from '../db/db'
import { freeCompactor, GRID_COLS, hasOverlap, organizeWorkspace, removeWindow } from '../lib/workspaces'
import { WINDOW_TYPES } from '../windows/registry'

/**
 * Conteúdo de uma janela. Memoizado: arrastar, redimensionar ou maximizar
 * não redesenha o conteúdo das janelas, só quando os dados delas mudam.
 */
const WindowBody = memo(function WindowBody({
  win,
  setConfig,
}: {
  win: WindowInstance
  setConfig: (id: string, patch: Record<string, unknown>) => void
}) {
  const Comp = WINDOW_TYPES[win.kind].component
  const set = useCallback((p: Record<string, unknown>) => setConfig(win.id, p), [setConfig, win.id])
  return <Comp win={win} setConfig={set} />
}, sameWindow)

// O banco devolve objetos novos a cada gravação do layout; compara pelo conteúdo.
function sameWindow(
  a: { win: WindowInstance; setConfig: unknown },
  b: { win: WindowInstance; setConfig: unknown },
) {
  return (
    a.setConfig === b.setConfig &&
    a.win.id === b.win.id &&
    a.win.kind === b.win.kind &&
    JSON.stringify(a.win.config) === JSON.stringify(b.win.config)
  )
}

/**
 * A "mesa" do app: cada janela pode ser arrastada pelo título e
 * redimensionada pelas bordas. Tudo encaixa numa grade de 24 colunas.
 */
export default function WorkspaceCanvas({ ws }: { ws: Workspace }) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [interacting, setInteracting] = useState(false)
  const [maxId, setMaxId] = useState<string | null>(null)
  const [resizingApp, setResizingApp] = useState(false)

  // Layout salvo com janelas sobrepostas (ex.: de versões antigas)? Arruma ao abrir.
  useEffect(() => {
    if (hasOverlap(ws.layout)) void organizeWorkspace(ws)
  }, [ws])

  // Enquanto o app (janela do Windows) muda de tamanho, desliga as animações.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const onResize = () => {
      setResizingApp(true)
      clearTimeout(t)
      t = setTimeout(() => setResizingApp(false), 250)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(t)
    }
  }, [])

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      const next: GridItem[] = layout.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH }))
      if (JSON.stringify(next) !== JSON.stringify(ws.layout)) {
        void db.workspaces.update(ws.id, { layout: next })
      }
    },
    [ws.id, ws.layout],
  )

  // Estável (não muda a cada render) e lê o estado atual do banco, para duas
  // mudanças rápidas seguidas não sobrescreverem uma à outra.
  const wsId = ws.id
  const setConfig = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      void db.transaction('rw', db.workspaces, async () => {
        const cur = await db.workspaces.get(wsId)
        if (!cur) return
        await db.workspaces.update(wsId, {
          windows: cur.windows.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)),
        })
      }),
    [wsId],
  )

  const start = () => setInteracting(true)
  const stop = () => setInteracting(false)

  return (
    <div
      ref={containerRef}
      className={`canvas ${interacting ? 'interacting' : ''} ${ws.locked ? 'locked' : ''} ${resizingApp || !mounted ? 'no-anim' : ''}`}
    >
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
          compactor={ws.snap === 'auto' ? verticalCompactor : freeCompactor}
          onLayoutChange={onLayoutChange}
          onDragStart={start}
          onDragStop={stop}
          onResizeStart={start}
          onResizeStop={stop}
        >
          {ws.windows.map((w) => {
            const type = WINDOW_TYPES[w.kind]
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
                  <WindowBody win={w} setConfig={setConfig} />
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
