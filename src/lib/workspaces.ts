import { db, type GridItem, type WindowInstance, type WindowKind, type Workspace } from '../db/db'
import { WINDOW_TYPES } from '../windows/registry'
import { uid } from './date'

export const GRID_COLS = 24

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
  await db.transaction('rw', db.workspaces, async () => {
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
  })
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
