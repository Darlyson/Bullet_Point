use std::time::Duration;
use tauri::Manager;

#[cfg(desktop)]
mod desktop;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // Uma instância só: abrir o app de novo (atalho da área de trabalho, menu
  // Iniciar) só traz de volta a janela que já está na bandeja. Fica de fora
  // na versão de teste, que senão se fecharia e abriria o app instalado.
  #[cfg(all(desktop, not(debug_assertions)))]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)));
  }

  #[cfg(desktop)]
  {
    builder = builder
      .invoke_handler(tauri::generate_handler![desktop::set_focus_status, desktop::shortcut_status])
      .on_window_event(desktop::on_window_event);
  }

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // A janela começa escondida (tauri.conf.json → visible: false) e o
      // front-end a mostra assim que desenha a primeira tela. Garantia: se
      // por algum motivo isso não acontecer, mostra depois de 3 segundos.
      if let Some(window) = app.get_webview_window("main") {
        std::thread::spawn(move || {
          std::thread::sleep(Duration::from_secs(3));
          let _ = window.show();
        });
      }

      #[cfg(desktop)]
      desktop::setup(app)?;

      #[cfg(windows)]
      if let Some(window) = app.get_webview_window("main") {
        if let Ok(hwnd) = window.hwnd() {
          mouse_capture_fix::start(hwnd.0 as isize);
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

/// Correção do "app que para de responder a cliques depois de arrastar a
/// barra de título" (Windows).
///
/// O que acontece: ao clicar na barra de título, o Windows entra num laço
/// próprio de "mover janela" e prende o mouse na janela principal até o
/// botão ser solto. A página (WebView2) roda em outro processo, ligado à
/// janela do app; às vezes o "soltou o botão" vai para ela e o laço nunca
/// termina. O app continua rodando, mas nenhum clique chega mais à página.
/// (Medido em 2026-11-25: mouse preso na janela principal com o botão solto;
/// mandar WM_CANCELMODE para a janela destravou na hora.)
///
/// Aqui, a cada 250 ms, uma thread separada olha se o mouse está preso na
/// janela principal sem nenhum botão apertado. Se continuar assim na checagem
/// seguinte, manda WM_CANCELMODE, que encerra o laço e solta o mouse.
#[cfg(windows)]
mod mouse_capture_fix {
  use std::{thread, time::Duration};

  #[repr(C)]
  #[derive(Default)]
  struct GuiThreadInfo {
    cb_size: u32,
    flags: u32,
    hwnd_active: isize,
    hwnd_focus: isize,
    hwnd_capture: isize,
    hwnd_menu_owner: isize,
    hwnd_move_size: isize,
    hwnd_caret: isize,
    rc_caret: [i32; 4],
  }

  #[link(name = "user32")]
  unsafe extern "system" {
    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
    fn GetGUIThreadInfo(thread_id: u32, info: *mut GuiThreadInfo) -> i32;
    fn GetAsyncKeyState(vkey: i32) -> i16;
    fn SendMessageTimeoutW(hwnd: isize, msg: u32, w: usize, l: isize, flags: u32, timeout: u32, result: *mut usize) -> isize;
  }

  const WM_CANCELMODE: u32 = 0x001F;
  const SMTO_ABORTIFHUNG: u32 = 0x0002;
  /// Botões esquerdo, direito e do meio.
  const MOUSE_BUTTONS: [i32; 3] = [0x01, 0x02, 0x04];

  fn any_button_pressed() -> bool {
    MOUSE_BUTTONS.iter().any(|&vk| unsafe { (GetAsyncKeyState(vk) as u16) & 0x8000 != 0 })
  }

  /// Bits de GUITHREADINFO.flags: movendo/redimensionando de verdade, ou menu aberto.
  const GUI_INMOVESIZE: u32 = 0x0002;
  const GUI_INMENUMODE: u32 = 0x0004;

  /// A janela segura o mouse sem estar num movimento/menu de verdade?
  fn holds_capture_idle(thread_id: u32, hwnd: isize) -> bool {
    let mut info = GuiThreadInfo { cb_size: std::mem::size_of::<GuiThreadInfo>() as u32, ..Default::default() };
    if unsafe { GetGUIThreadInfo(thread_id, &mut info) } == 0 {
      return false;
    }
    info.hwnd_capture == hwnd && info.flags & (GUI_INMOVESIZE | GUI_INMENUMODE) == 0
  }

  /// `hwnd` é lido uma vez, no início: as funções do Tauri que leem a janela
  /// rodam na thread principal, que é justamente a que fica presa.
  pub fn start(hwnd: isize) {
    let thread_id = unsafe { GetWindowThreadProcessId(hwnd, std::ptr::null_mut()) };
    thread::spawn(move || {
      let mut stuck_checks = 0;
      loop {
        thread::sleep(Duration::from_millis(250));

        if holds_capture_idle(thread_id, hwnd) && !any_button_pressed() {
          stuck_checks += 1;
        } else {
          stuck_checks = 0;
        }
        if stuck_checks >= 2 {
          stuck_checks = 0;
          let mut result = 0usize;
          unsafe { SendMessageTimeoutW(hwnd, WM_CANCELMODE, 0, 0, SMTO_ABORTIFHUNG, 1000, &mut result) };
          log::info!("mouse preso na janela principal sem botão apertado: WM_CANCELMODE enviado");
        }
      }
    });
  }
}

