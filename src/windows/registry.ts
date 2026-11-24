import type { ComponentType } from 'react'
import type { WindowKind } from '../db/db'
import type { WindowProps } from './types'
import TodayWindow from './TodayWindow'
import HabitsWindow from './HabitsWindow'
import JournalWindow from './JournalWindow'
import NotesWindow from './NotesWindow'
import FocusWindow from './FocusWindow'
import YouTubeWindow from './YouTubeWindow'
import StatsWindow from './StatsWindow'
import TopicsWindow from './TopicsWindow'

export interface WindowType {
  title: string
  icon: string
  description: string
  component: ComponentType<WindowProps>
  /** Tamanho padrão em células da grade (24 colunas) */
  size: { w: number; h: number; minW: number; minH: number }
  /** Só pode existir uma por espaço de trabalho? */
  single?: boolean
}

/** Para criar um novo tipo de janela: crie o componente e registre aqui. */
export const WINDOW_TYPES: Record<WindowKind, WindowType> = {
  today: { title: 'Hoje', icon: '☀', description: 'Resumo do dia', component: TodayWindow, size: { w: 6, h: 13, minW: 4, minH: 6 } },
  habits: { title: 'Hábitos', icon: '✔', description: 'Registro semanal de hábitos', component: HabitsWindow, size: { w: 10, h: 12, minW: 6, minH: 6 } },
  journal: { title: 'Diário', icon: '•', description: 'Caderno bullet journal', component: JournalWindow, size: { w: 8, h: 16, minW: 5, minH: 8 } },
  notes: { title: 'Notas', icon: '✎', description: 'Anotações livres', component: NotesWindow, size: { w: 12, h: 16, minW: 7, minH: 8 } },
  focus: { title: 'Foco', icon: '⏱', description: 'Cronômetro / pomodoro por tópico', component: FocusWindow, size: { w: 7, h: 14, minW: 5, minH: 8 }, single: true },
  youtube: { title: 'YouTube', icon: '▶', description: 'Vídeo ligado à sessão de foco', component: YouTubeWindow, size: { w: 11, h: 14, minW: 5, minH: 6 } },
  stats: { title: 'Gráficos', icon: '📊', description: 'Gráficos e análises', component: StatsWindow, size: { w: 12, h: 20, minW: 7, minH: 10 } },
  topics: { title: 'Tópicos', icon: '◆', description: 'O que liga tudo', component: TopicsWindow, size: { w: 8, h: 14, minW: 5, minH: 6 } },
}
