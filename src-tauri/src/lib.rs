use std::time::Duration;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
