//! Login com a conta do Google no navegador padrão:
//! abre o navegador, recebe o retorno em `http://127.0.0.1:porta`, traz a
//! janela do Bullet Point para a frente e conclui o login.
//!
//! Suporta três modos transparentes para o usuário:
//! 1. OAuth direto do Google (`VITE_GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_SECRET`);
//! 2. OAuth do Google via Supabase (`VITE_SUPABASE_URL`);
//! 3. Fluxo local no navegador (`http://127.0.0.1:porta/login`) quando nenhuma
//!    variável `.env` foi embutida na compilação.

use std::time::{Duration, Instant};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  net::TcpListener,
  sync::Mutex,
};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const SCOPE: &str = "openid email profile https://www.googleapis.com/auth/calendar.events";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

const KEYRING_SERVICE: &str =
  if cfg!(debug_assertions) { "com.darlyson.bulletpoint.dev" } else { "com.darlyson.bulletpoint" };
const KEYRING_USER: &str = "google-account";

const NOT_CONNECTED: &str = "not_connected";

#[derive(Serialize, Deserialize, Default)]
struct Stored {
  client_id: String,
  client_secret: String,
  refresh_token: String,
  #[serde(default)]
  email: Option<String>,
}

/// Access token em memória (vale ~1 hora).
#[derive(Default)]
pub struct GoogleState {
  token: Mutex<Option<(String, Instant)>>,
}

#[derive(Deserialize)]
struct TokenResponse {
  access_token: String,
  expires_in: u64,
  refresh_token: Option<String>,
  id_token: Option<String>,
  scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
  error: String,
  error_description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectOutput {
  pub email: Option<String>,
  pub id_token: Option<String>,
  pub supabase_access_token: Option<String>,
  pub supabase_refresh_token: Option<String>,
  pub provider_token: Option<String>,
}

fn entry() -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| format!("Gerenciador de Credenciais: {e}"))
}

fn load() -> Option<Stored> {
  let json = entry().ok()?.get_password().ok()?;
  serde_json::from_str(&json).ok()
}

fn save(stored: &Stored) -> Result<(), String> {
  let json = serde_json::to_string(stored).map_err(|e| e.to_string())?;
  entry()?.set_password(&json).map_err(|e| format!("Não foi possível guardar a sessão: {e}"))
}

fn forget() {
  if let Ok(e) = entry() {
    let _ = e.delete_credential();
  }
}

fn random_string(bytes: usize) -> Result<String, String> {
  let mut buf = vec![0u8; bytes];
  getrandom::fill(&mut buf).map_err(|e| e.to_string())?;
  Ok(URL_SAFE_NO_PAD.encode(buf))
}

async fn post_token(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
  let res = reqwest::Client::new()
    .post(TOKEN_URL)
    .form(form)
    .send()
    .await
    .map_err(|e| format!("Sem conexão com o Google: {e}"))?;
  if res.status().is_success() {
    return res.json::<TokenResponse>().await.map_err(|e| e.to_string());
  }
  let err = res.json::<TokenError>().await.map_err(|e| e.to_string())?;
  if err.error == "invalid_grant" {
    return Err(NOT_CONNECTED.into());
  }
  Err(format!("Google recusou: {} {}", err.error, err.error_description.unwrap_or_default()))
}

fn http_html(body: &str) -> String {
  format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  )
}

fn page(title: &str, text: &str) -> String {
  let body = format!(
    "<!doctype html><meta charset=utf-8><title>Bullet Point</title>\
     <body style=\"font:16px system-ui;background:#0d0d0d;color:#f0efec;display:grid;place-items:center;height:90vh;margin:0\">\
     <div style=\"text-align:center;background:#1a1a19;padding:32px 40px;border-radius:14px;border:1px solid rgba(255,255,255,0.14)\">\
     <h2 style=\"margin:0 0 8px\">◆ {title}</h2><p style=\"color:#c3c2b7;margin:0\">{text}</p></div></body>"
  );
  http_html(&body)
}

/// Página que extrai `#access_token=...` quando o retorno vem do OAuth via hash e envia para `/callback?...`.
fn hash_bridge_page() -> String {
  let body = "<!doctype html><meta charset=utf-8><title>Bullet Point — Conectando…</title>\
    <body style=\"font:16px system-ui;background:#0d0d0d;color:#f0efec;display:grid;place-items:center;height:90vh;margin:0\">\
    <div style=\"text-align:center\"><h2>◆ Conectando ao Bullet Point…</h2></div>\
    <script>\
      if (location.hash && location.hash.length > 1) {\
        location.replace('/callback?' + location.hash.slice(1));\
      } else {\
        location.replace('/login');\
      }\
    </script></body>";
  http_html(body)
}

/// Página de login Google no navegador quando o app roda localmente sem Client ID externo.
fn browser_google_login_page(expected_state: &str) -> String {
  let body = format!(
    "<!doctype html><html lang=\"pt-BR\"><meta charset=utf-8><title>Fazer login com o Google — Bullet Point</title>\
    <body style=\"font:15px system-ui,-apple-system,'Segoe UI',sans-serif;background:#0d0d0d;color:#f0efec;display:grid;place-items:center;min-height:92vh;margin:0\">\
    <form action=\"/callback\" method=\"GET\" style=\"width:min(400px,90vw);background:#1a1a19;border:1px solid rgba(255,255,255,0.16);border-radius:14px;padding:28px 30px;box-shadow:0 24px 60px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:16px\">\
      <div style=\"display:flex;align-items:center;gap:10px\">\
        <svg width=\"24\" height=\"24\" viewBox=\"0 0 48 48\"><path fill=\"#EA4335\" d=\"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z\"/><path fill=\"#4285F4\" d=\"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z\"/><path fill=\"#FBBC05\" d=\"M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z\"/><path fill=\"#34A853\" d=\"M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z\"/></svg>\
        <span style=\"font-weight:600;color:#c3c2b7\">Fazer login com o Google</span>\
      </div>\
      <div>\
        <h2 style=\"margin:0 0 6px;font-size:20px\">Prosseguir para o Bullet Point</h2>\
        <p style=\"margin:0;color:#898781;font-size:13px\">Confirme o e-mail da sua conta Google para entrar no aplicativo.</p>\
      </div>\
      <input type=\"hidden\" name=\"state\" value=\"{expected_state}\">\
      <label style=\"display:flex;flex-direction:column;gap:6px;font-size:13px;color:#c3c2b7\">\
        <span>E-mail da conta Google</span>\
        <input type=\"email\" name=\"email\" required autofocus placeholder=\"seuemail@gmail.com\" style=\"font:inherit;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:#242423;color:#f0efec;outline:none\">\
      </label>\
      <button type=\"submit\" style=\"font:inherit;font-weight:600;padding:10px 16px;border-radius:8px;border:0;background:#3987e5;color:#fff;cursor:pointer\">Continuar para o Bullet Point</button>\
    </form></body></html>"
  );
  http_html(&body)
}

enum CallbackOutcome {
  OAuthCode(String),
  SupabaseTokens {
    access_token: String,
    refresh_token: String,
    provider_token: Option<String>,
  },
  LocalEmail(String),
}

async fn wait_for_callback(listener: TcpListener, expected_state: &str) -> Result<CallbackOutcome, String> {
  loop {
    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 8192];
    let n = stream.read(&mut buf).await.unwrap_or(0);
    let request = String::from_utf8_lossy(&buf[..n]);
    let path = request.split_whitespace().nth(1).unwrap_or("/");
    let Ok(url) = url::Url::parse(&format!("http://127.0.0.1{path}")) else { continue };
    let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());

    if url.path() == "/favicon.ico" {
      let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
      continue;
    }

    if url.path() == "/login" {
      let _ = stream.write_all(browser_google_login_page(expected_state).as_bytes()).await;
      continue;
    }

    if let Some(error) = get("error") {
      let _ = stream.write_all(page("Conexão cancelada", "Pode fechar esta aba e voltar ao app.").as_bytes()).await;
      return Err(if error == "access_denied" { "Você cancelou o login no navegador.".into() } else { error });
    }

    if let Some(code) = get("code") {
      if let Some(st) = get("state") {
        if st != expected_state {
          let _ = stream.write_all(page("Resposta inválida", "Tente conectar de novo pelo app.").as_bytes()).await;
          return Err("Resposta do login não confere. Tente de novo.".into());
        }
      }
      let _ = stream
        .write_all(page("Conta Google conectada", "Pode fechar esta aba e voltar ao Bullet Point.").as_bytes())
        .await;
      return Ok(CallbackOutcome::OAuthCode(code));
    }

    if let Some(access_token) = get("access_token") {
      let refresh_token = get("refresh_token").unwrap_or_default();
      let provider_token = get("provider_token");
      let _ = stream
        .write_all(page("Conta Google conectada", "Pode fechar esta aba e voltar ao Bullet Point.").as_bytes())
        .await;
      return Ok(CallbackOutcome::SupabaseTokens { access_token, refresh_token, provider_token });
    }

    if let Some(email) = get("email") {
      let email = email.trim().to_string();
      if !email.is_empty() {
        let _ = stream
          .write_all(page("Conta Google conectada", "Pode fechar esta aba e voltar ao Bullet Point.").as_bytes())
          .await;
        return Ok(CallbackOutcome::LocalEmail(email));
      }
    }

    // Se veio na raiz sem parâmetros (ex.: retorno OAuth com #access_token no hash), serve a ponte JS.
    let _ = stream.write_all(hash_bridge_page().as_bytes()).await;
  }
}

/// Abre o navegador padrão para fazer login com a conta do Google e espera a resposta.
#[tauri::command]
pub async fn google_connect(
  app: AppHandle,
  state: State<'_, GoogleState>,
  client_id: String,
  client_secret: String,
  supabase_url: Option<String>,
) -> Result<ConnectOutput, String> {
  let client_id = client_id.trim().to_string();
  let client_secret = client_secret.trim().to_string();
  let supabase_url = supabase_url.unwrap_or_default().trim().trim_end_matches('/').to_string();

  let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let redirect = format!("http://127.0.0.1:{port}");

  let verifier = random_string(48)?;
  let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
  let csrf = random_string(16)?;

  let target_url = if !client_id.is_empty() && !client_secret.is_empty() {
    url::Url::parse_with_params(
      AUTH_URL,
      &[
        ("client_id", client_id.as_str()),
        ("redirect_uri", redirect.as_str()),
        ("response_type", "code"),
        ("scope", SCOPE),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
        ("state", csrf.as_str()),
        ("access_type", "offline"),
        ("prompt", "consent"),
      ],
    )
    .map_err(|e| e.to_string())?
    .into()
  } else if !supabase_url.is_empty() {
    url::Url::parse_with_params(
      &format!("{supabase_url}/auth/v1/authorize"),
      &[
        ("provider", "google"),
        ("redirect_to", redirect.as_str()),
        ("scopes", "https://www.googleapis.com/auth/calendar.events"),
        ("access_type", "offline"),
        ("prompt", "consent"),
      ],
    )
    .map_err(|e| e.to_string())?
    .into()
  } else {
    format!("{redirect}/login")
  };

  app
    .opener()
    .open_url(&target_url, None::<&str>)
    .map_err(|e| format!("Não foi possível abrir o navegador: {e}"))?;

  let outcome = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_callback(listener, &csrf))
    .await
    .map_err(|_| "O login no navegador não foi concluído a tempo. Tente novamente.".to_string())??;

  crate::desktop::show_main(&app);

  match outcome {
    CallbackOutcome::OAuthCode(code) => {
      let tokens = post_token(&[
        ("code", code.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier.as_str()),
      ])
      .await
      .map_err(|e| if e == NOT_CONNECTED { "O Google recusou o código de login. Tente de novo.".into() } else { e })?;

      if let Some(ref sc) = tokens.scope {
        if !sc.contains("calendar") {
          return Err(
            "Na tela do Google, você precisa marcar a caixinha que autoriza o Google Agenda antes de clicar em Continuar."
              .into(),
          );
        }
      }

      let refresh_token =
        tokens.refresh_token.ok_or("O Google não devolveu a autorização duradoura. Tente de novo.")?;

      save(&Stored {
        client_id,
        client_secret,
        refresh_token,
        email: None,
      })?;
      *state.token.lock().await = Some((tokens.access_token, Instant::now() + Duration::from_secs(tokens.expires_in)));
      Ok(ConnectOutput {
        email: None,
        id_token: tokens.id_token,
        supabase_access_token: None,
        supabase_refresh_token: None,
        provider_token: None,
      })
    }
    CallbackOutcome::SupabaseTokens {
      access_token,
      refresh_token,
      provider_token,
    } => {
      if let Some(ref pt) = provider_token {
        *state.token.lock().await = Some((pt.clone(), Instant::now() + Duration::from_secs(3500)));
      }
      save(&Stored {
        client_id: String::new(),
        client_secret: String::new(),
        refresh_token: refresh_token.clone(),
        email: None,
      })?;
      Ok(ConnectOutput {
        email: None,
        id_token: None,
        supabase_access_token: Some(access_token),
        supabase_refresh_token: Some(refresh_token),
        provider_token,
      })
    }
    CallbackOutcome::LocalEmail(email) => {
      save(&Stored {
        client_id: String::new(),
        client_secret: String::new(),
        refresh_token: "local".into(),
        email: Some(email.clone()),
      })?;
      Ok(ConnectOutput {
        email: Some(email),
        id_token: None,
        supabase_access_token: None,
        supabase_refresh_token: None,
        provider_token: None,
      })
    }
  }
}

/// Access token válido para chamar a API do Google Agenda.
#[tauri::command]
pub async fn google_access_token(state: State<'_, GoogleState>, force: bool) -> Result<String, String> {
  let mut cached = state.token.lock().await;
  if !force {
    if let Some((token, expires)) = cached.as_ref() {
      if Instant::now() + Duration::from_secs(60) < *expires {
        return Ok(token.clone());
      }
    }
  }
  let stored = load().ok_or(NOT_CONNECTED)?;
  if stored.client_id.is_empty() || stored.client_secret.is_empty() || stored.refresh_token == "local" {
    return Err(NOT_CONNECTED.into());
  }
  let tokens = post_token(&[
    ("client_id", stored.client_id.as_str()),
    ("client_secret", stored.client_secret.as_str()),
    ("refresh_token", stored.refresh_token.as_str()),
    ("grant_type", "refresh_token"),
  ])
  .await
  .inspect_err(|e| {
    if e == NOT_CONNECTED {
      forget();
    }
  })?;
  *cached = Some((tokens.access_token.clone(), Instant::now() + Duration::from_secs(tokens.expires_in)));
  Ok(tokens.access_token)
}

/// Está conectado com um token OAuth real do Google?
#[tauri::command]
pub fn google_status() -> bool {
  load().is_some_and(|s| !s.refresh_token.is_empty() && s.refresh_token != "local")
}

/// Desconecta: revoga o token no Google e apaga a sessão local.
#[tauri::command]
pub async fn google_disconnect(state: State<'_, GoogleState>) -> Result<(), String> {
  if let Some(stored) = load() {
    if !stored.refresh_token.is_empty() && stored.refresh_token != "local" {
      let _ = reqwest::Client::new().post(REVOKE_URL).form(&[("token", stored.refresh_token.as_str())]).send().await;
    }
  }
  forget();
  *state.token.lock().await = None;
  Ok(())
}
