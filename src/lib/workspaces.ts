import { collides, verticalCompactor, type Compactor, type Layout, type LayoutItem } from 'react-grid-layout'
import { db, type GridItem, type WindowInstance, type WindowKind, type Workspace } from '../db/db'
import { withoutCloudTracking } from '../cloud/track'
import { WINDOW_TYPES } from '../windows/registry'
import { uid } from './date'

export const GRID_COLS = 24

/**
 * Modo "Livre": a janela vai para onde você arrastar e as que estiverem no
 * caminho descem só o necessário. Nada sobe sozinho (buracos ficam onde você
 * deixou).
 *
 * Antes usávamos "preventCollision": qualquer posição que encostasse em outra
 * janela era recusada, então com a mesa cheia a janela travava no lugar.
 *
 * Para não acumular empurrões (que geravam buracos e sobreposições), a cada
 * movimento as outras janelas partem da posição que tinham quando o arraste
 * começou; só a janela arrastada usa a posição nova.
 */
export function createFreeCompactor() {
  let activeId: string | null = null
  let start = new Map<string, { x: number; y: number }>()

  const compactor: Compactor = {
    type: null,
    // A grade só posiciona a janela arrastada; quem resolve as colisões é o
    // compact() abaixo, empurrando as outras para baixo.
    allowOverlap: true,
    compact(layout: Layout): Layout {
      const items: LayoutItem[] = layout.map((l) => {
        const c = { ...l, moved: false }
        const s = c.i !== activeId ? start.get(c.i) : undefined
        if (s) {
          c.x = s.x
          c.y = s.y
        }
        return c
      })
      const active = items.find((c) => c.i === activeId)
      const placed: LayoutItem[] = active ? [active] : []
      const others = items.filter((c) => c !== active).sort((a, b) => a.y - b.y || a.x - b.x)
      for (const c of others) {
        let hit: LayoutItem | undefined
        while ((hit = placed.find((p) => collides(p, c)))) c.y = hit.y + hit.h
        placed.push(c)
      }
      return items
    },
  }

  return {
    compactor,
    /** Chamar no início do arraste/redimensionamento. */
    begin(layout: Layout, id: string) {
      activeId = id
      start = new Map(layout.map((l) => [l.i, { x: l.x, y: l.y }]))
    },
    /** Chamar no fim (depois que a grade já calculou a posição final). */
    end() {
      activeId = null
      start = new Map()
    },
  }
}

export function hasOverlap(layout: readonly GridItem[]): boolean {
  for (let i = 0; i < layout.length; i++)
    for (let j = i + 1; j < layout.length; j++) if (collides(layout[i], layout[j])) return true
  return false
}

const strip = ({ i, x, y, w, h, minW, minH }: GridItem): GridItem => ({ i, x, y, w, h, minW, minH })

/** Junta as janelas no topo, sem buracos nem sobreposições (mantém a ordem). */
export async function organizeWorkspace(ws: Workspace) {
  const layout = verticalCompactor.compact(ws.layout, GRID_COLS).map(strip)
  await db.workspaces.update(ws.id, { layout })
}

function win(kind: WindowKind, x: number, y: number, w?: number, h?: number): { window: WindowInstance; item: GridItem } {
  const t = WINDOW_TYPES[kind]
  const id = uid()
  return {
    window: { id, kind },
    item: { i: id, x, y, w: w ?? t.size.w, h: h ?? t.size.h, minW: t.size.minW, minH: t.size.minH },
  }
}

function build(name: string, order: number, parts: ReturnType<typeof win>[]): Workspace {
  return {
    id: uid(),
    name,
    order,
    windows: parts.map((p) => p.window),
    layout: parts.map((p) => p.item),
    snap: 'free',
    locked: false,
  }
}

/** Cria os espaços de trabalho iniciais na primeira vez que o app abre. */
export async function ensureDefaultWorkspaces() {
  await withoutCloudTracking(() =>
    db.transaction('rw', db.workspaces, async () => {
      if ((await db.workspaces.count()) > 0) return
      await db.workspaces.bulkAdd([
        build('Principal', 0, [
          win('focus', 0, 0, 7, 14),
          win('youtube', 7, 0, 11, 14),
          win('today', 18, 0, 6, 14),
          win('habits', 0, 14, 10, 12),
          win('journal', 10, 14, 7, 16),
          win('notes', 17, 14, 7, 16),
        ]),
        build('Análise', 1, [win('stats', 0, 0, 14, 22), win('topics', 14, 0, 10, 14)]),
      ])
    }),
  )
}

export async function addWindow(ws: Workspace, kind: WindowKind) {
  const bottom = ws.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
  const part = win(kind, 0, bottom)
  await db.workspaces.update(ws.id, {
    windows: [...ws.windows, part.window],
    layout: [...ws.layout, part.item],
  })
}

export async function removeWindow(ws: Workspace, id: string) {
  await db.workspaces.update(ws.id, {
    windows: ws.windows.filter((w) => w.id !== id),
    layout: ws.layout.filter((l) => l.i !== id),
  })
}

export async function createWorkspace(name: string) {
  const all = await db.workspaces.toArray()
  const ws = build(name, all.reduce((m, w) => Math.max(m, w.order), -1) + 1, [])
  await db.workspaces.add(ws)
  return ws.id
}
