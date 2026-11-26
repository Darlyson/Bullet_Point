//! Coisas que só existem no app desktop: ícone na bandeja do sistema,
//! atalhos globais (funcionam com o app em segundo plano) e "fechar manda
//! para a bandeja".
//!
//! O front-end recebe os pedidos por eventos (`bp://quick-add`,
//! `bp://focus-toggle`) e devolve o estado do foco por `set_focus_status`,
//! que atualiza o menu e a dica do ícone.

use serde::Serialize;
use tauri::{
  App, AppHandle, Emitter, Manager, Window, WindowEvent, Wry,
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const APP_NAME: &str = if cfg!(debug_assertions) { "Bullet Point — TESTE" } else { "Bullet Point" };

#[derive(Clone, Copy, PartialEq)]
enum Action {
  ToggleWindow,
  QuickAdd,
  FocusToggle,
}

/// Atalhos globais. Ctrl+Alt+letra: não briga com o AltGr do teclado ABNT2
/// (AltGr = Ctrl+Alt), que não usa B, N nem F.
const SHORTCUTS: [(Action, Code, &str, &str); 3] = [
  (Action::ToggleWindow, Code::KeyB, "Ctrl+Alt+B", "Mostrar / esconder o app"),
  (Action::QuickAdd, Code::KeyN, "Ctrl+Alt+N", "Anotação rápida no diário de hoje"),
  (Action::FocusToggle, Code::KeyF, "Ctrl+Alt+F", "Iniciar / pausar o foco"),
];

fn shortcut(code: Code) -> Shortcut {
  Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code)
}

#[derive(Clone, Serialize)]
pub struct ShortcutInfo {
  keys: String,
  action: String,
  /// false: outro programa (ou o app instalado, na versão de teste) já usa essa combinação.
  ok: bool,
}

struct DesktopState {
  tray: TrayIcon<Wry>,
  focus_item: MenuItem<Wry>,
  shortcuts: Vec<ShortcutInfo>,
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
  let handle = app.handle();

  // ---------- bandeja ----------
  let open = MenuItem::with_id(handle, "open", "Abrir Bullet Point", true, Some("Ctrl+Alt+B"))?;
  let quick = MenuItem::with_id(handle, "quick-add", "Anotação rápida…", true, Some("Ctrl+Alt+N"))?;
  let focus_item = MenuItem::with_id(handle, "focus", "Iniciar foco", true, Some("Ctrl+Alt+F"))?;
  let quit = MenuItem::with_id(handle, "quit", "Sair", true, None::<&str>)?;
  let menu = Menu::with_items(
    handle,
    &[&open, &quick, &focus_item, &PredefinedMenuItem::separator(handle)?, &quit],
  )?;

  let mut tray = TrayIconBuilder::with_id("main")
    .tooltip(APP_NAME)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id().as_ref() {
      "open" => show_main(app),
      "quick-add" => run(app, Action::QuickAdd),
      "focus" => run(app, Action::FocusToggle),
      "quit" => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
        show_main(tray.app_handle());
      }
    });
  if let Some(icon) = handle.default_window_icon() {
    tray = tray.icon(icon.clone());
  }
  let tray = tray.build(handle)?;

  // ---------- atalhos globais ----------
  handle.plugin(
    tauri_plugin_global_shortcut::Builder::new()
      .with_handler(|app, pressed, event| {
        if event.state() != ShortcutState::Pressed {
          return;
        }
        if let Some((action, ..)) = SHORTCUTS.iter().find(|(_, code, ..)| shortcut(*code) == *pressed) {
          run(app, *action);
        }
      })
      .build(),
  )?;
  let shortcuts = SHORTCUTS
    .iter()
    .map(|(_, code, keys, action)| {
      let ok = match handle.global_shortcut().register(shortcut(*code)) {
        Ok(()) => true,
        Err(e) => {
          log::warn!("atalho {keys} não registrado: {e}");
          false
        }
      };
      ShortcutInfo { keys: keys.to_string(), action: action.to_string(), ok }
    })
    .collect();

  app.manage(DesktopState { tray, focus_item, shortcuts });
  Ok(())
}

/// Traz a janela de volta (da bandeja ou minimizada) e dá foco a ela.
pub fn show_main(app: &AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    // unminimize() numa janela que não está minimizada tira ela do maximizado.
    if w.is_minimized().unwrap_or(false) {
      let _ = w.unminimize();
    }
    let _ = w.show();
    let _ = w.set_focus();
  }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuickAdd {
  /// Como deixar a janela depois de salvar: "hide" (estava na bandeja),
  /// "minimize" (estava minimizada) ou "none" (já estava aberta).
  restore: &'static str,
}

fn run(app: &AppHandle, action: Action) {
  let Some(w) = app.get_webview_window("main") else { return };
  let visible = w.is_visible().unwrap_or(false);
  let minimized = w.is_minimized().unwrap_or(false);
  match action {
    Action::ToggleWindow => {
      if visible && !minimized && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
      } else {
        show_main(app);
      }
    }
    Action::QuickAdd => {
      let restore = if !visible { "hide" } else if minimized { "minimize" } else { "none" };
      show_main(app);
      let _ = w.emit("bp://quick-add", QuickAdd { restore });
    }
    Action::FocusToggle => {
      let _ = w.emit("bp://focus-toggle", ());
    }
  }
}

/// Fechar a janela (botão ✕, Alt+F4) só a esconde: o app continua na
/// bandeja, com o cronômetro e os atalhos funcionando. "Sair" no menu do
/// ícone fecha de verdade.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
  if let WindowEvent::CloseRequested { api, .. } = event {
    if window.label() == "main" {
      api.prevent_close();
      let _ = window.hide();
    }
  }
}

/// O front-end avisa como está o foco: muda o texto do item no menu e a dica do ícone.
/// `async` para rodar fora da thread principal (menu e ícone mandam o trabalho para ela).
#[tauri::command]
pub async fn set_focus_status(app: AppHandle, menu_text: String, tooltip: String) -> Result<(), String> {
  let state = app.state::<DesktopState>();
  state.focus_item.set_text(menu_text).map_err(|e| e.to_string())?;
  let tip = if tooltip.is_empty() { APP_NAME.to_string() } else { format!("{APP_NAME}\n{tooltip}") };
  state.tray.set_tooltip(Some(tip)).map_err(|e| e.to_string())?;
  Ok(())
}

/// Lista dos atalhos globais e se cada um foi registrado.
#[tauri::command]
pub fn shortcut_status(app: AppHandle) -> Vec<ShortcutInfo> {
  app.state::<DesktopState>().shortcuts.clone()
}
