import Dexie, { type EntityTable } from 'dexie'

/**
 * Modelo de dados.
 * O "Tópico" é o elo central: hábitos, bullets, notas e sessões de foco
 * podem apontar para um topicId. IDs são UUID (string) para facilitar
 * sincronização com a nuvem no futuro.
 */

export interface Topic {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface Habit {
  id: string
  name: string
  topicId?: string
  color: string
  /** Meta de vezes por semana (1–7) */
  targetPerWeek: number
  archived: boolean
  createdAt: number
}

export interface HabitLog {
  id: string
  habitId: string
  /** Data local no formato YYYY-MM-DD */
  date: string
}

export type BulletType = 'task' | 'event' | 'note'
export type BulletStatus = 'open' | 'done' | 'migrated' | 'cancelled'

export interface Bullet {
  id: string
  date: string
  type: BulletType
  status: BulletStatus
  text: string
  topicId?: string
  createdAt: number
  /** Evento: horário "HH:MM" de início e de fim. Sem horário = dia inteiro. */
  time?: string
  endTime?: string
  /** Momento (ms) da última alteração. */
  updatedAt?: number
  /** Google Agenda: id do evento lá. */
  gcalId?: string
  /** Google Agenda: mudou aqui e ainda não foi enviado (ver src/google/track.ts). */
  gcalDirty?: boolean
  /**
   * Muda a cada escrita do sincronizador. O Dexie só passa ao "hook" os campos
   * que mudaram de valor; este sempre muda, então o hook sabe que não foi você.
   */
  gcalSync?: string
}

export interface Note {
  id: string
  title: string
  content: string
  topicId?: string
  createdAt: number
  updatedAt: number
}

export interface FocusSession {
  id: string
  topicId?: string
  label: string
  youtubeUrl?: string
  startedAt: number
  durationSec: number
  date: string
}

/** Tipos de janela que podem ser colocadas no espaço de trabalho. */
export type WindowKind =
  | 'today'
  | 'habits'
  | 'journal'
  | 'notes'
  | 'focus'
  | 'youtube'
  | 'stats'
  | 'topics'

export interface WindowInstance {
  id: string
  kind: WindowKind
  /** Configuração própria da janela (ex.: tópico filtrado, nota aberta). */
  config?: Record<string, unknown>
}

export interface GridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

/** Um espaço de trabalho = um conjunto de janelas e suas posições na grade. */
export interface Workspace {
  id: string
  name: string
  order: number
  windows: WindowInstance[]
  layout: GridItem[]
  /** 'free' = fica onde você soltar; 'auto' = janelas sobem e se empilham sozinhas */
  snap: 'free' | 'auto'
  locked: boolean
}

export const db = new Dexie('BulletPointDB') as Dexie & {
  workspaces: EntityTable<Workspace, 'id'>
  topics: EntityTable<Topic, 'id'>
  habits: EntityTable<Habit, 'id'>
  habitLogs: EntityTable<HabitLog, 'id'>
  bullets: EntityTable<Bullet, 'id'>
  notes: EntityTable<Note, 'id'>
  focusSessions: EntityTable<FocusSession, 'id'>
}

// Apenas campos indexados aparecem aqui (os demais são salvos normalmente).
db.version(1).stores({
  topics: 'id, name',
  habits: 'id, topicId',
  habitLogs: 'id, habitId, date, [habitId+date]',
  bullets: 'id, date, topicId, status',
  notes: 'id, topicId, updatedAt',
  focusSessions: 'id, topicId, date, startedAt',
  workspaces: 'id, order',
})
// v2: Google Agenda (achar o bullet pelo id do evento no Google).
db.version(2).stores({
  bullets: 'id, date, topicId, status, gcalId',
})

// Em desenvolvimento, permite inspecionar o banco pelo console do navegador: `db.habits.toArray()`
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).db = db

export const TABLES = ['workspaces', 'topics', 'habits', 'habitLogs', 'bullets', 'notes', 'focusSessions'] as const
export type TableName = (typeof TABLES)[number]
