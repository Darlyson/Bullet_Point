import type { WindowInstance } from '../db/db'

export interface WindowProps {
  win: WindowInstance
  /** Salva configuração própria desta janela (persistida no espaço de trabalho). */
  setConfig: (patch: Record<string, unknown>) => void
}
