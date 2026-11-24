/** Utilidades para quando o app roda como desktop (Tauri). No navegador, não fazem nada. */

export const isDesktop = () => '__TAURI_INTERNALS__' in window

let shown = false

/** Mostra a janela do app (ela abre escondida para não piscar em branco). */
export async function showDesktopWindow() {
  if (shown || !isDesktop()) return
  shown = true
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().show()
}
