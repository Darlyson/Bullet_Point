# ◆ Bullet Point

App de produtividade "tudo vinculado": hábitos, bullet journal, notas, sessões de foco com cronômetro + YouTube e gráficos de evolução, organizados em um **espaço de trabalho com janelas** que você arrasta, redimensiona e encaixa onde quiser.

## Rodar

```bash
npm install
npm run desktop        # versão de TESTE (Tauri) com recarga automática ao editar o código
npm run desktop:build  # gera o instalador em src-tauri/target/release/bundle/nsis/
npm run dev            # só no navegador: http://localhost:5173
npm run build          # checa tipos e gera a versão web em dist/
```

O app desktop precisa de [Rust](https://rustup.rs) e do Visual Studio com "Desenvolvimento para desktop com C++" (pré-requisitos do [Tauri](https://tauri.app/start/prerequisites/)).

> ⚠ No Windows, rode os comandos do desktop pelo **PowerShell** ou CMD, não pelo Git Bash. O comando `link` do Git Bash esconde o `link.exe` da Microsoft e a compilação falha com "link: extra operand".

> **Versão de teste × instalada:** a de teste (`npm run desktop` / `npm run dev`) tem o selo laranja **TESTE** no topo e "TESTE" no título da janela. A instalada não tem.

> **Os dados do app desktop e do navegador são separados.** Cada um tem seu próprio banco local. Para levar dados de um para o outro, use **⋯ → Exportar** num e **Importar** no outro.

## Como usar

- **Mover o app:** arraste pelas áreas vazias da barra de cima (o app não usa a barra de título do Windows). Clique duplo nela maximiza/restaura; ─ □ ✕ ficam no canto direito.
- **Arrastar janela:** segure pelo título.
- **Redimensionar:** pelas bordas (direita, esquerda, baixo) ou pelo canto inferior direito.
- **Maximizar:** clique duplo no título (ou no botão □).
- **+ Janela:** adiciona módulos. Você pode abrir mais de uma janela de Notas, Hábitos etc.
- **✥ Livre / ⇧ Auto-encaixe:** no modo livre a janela fica onde você soltar e as que estiverem no caminho descem só o necessário (nada sobe sozinho). No auto-encaixe as janelas sobem e se empilham sozinhas.
- **▦ Organizar:** junta todas as janelas no topo, sem buracos nem sobreposições.
- **🔓 Editar / 🔒 Travado:** trava o layout para não mover nada sem querer.
- **Abas no topo:** cada aba é um espaço de trabalho (ex.: "Estudo", "Manhã"). Clique duplo renomeia, botão direito exclui.
- **Diário:** tarefas (`•`), eventos (`○`, com horário opcional) e notas (`–`). Clique duplo no texto edita o item.
- **⋯:** **Conta Google (Agenda + Nuvem)** — com 1 clique em **Entrar com o Google**, sincroniza em mão dupla os eventos (`○`) com o **Google Agenda** e todos os dados na nuvem (**Supabase**) entre PC e celular. Também exporta/importa backup `.json` e lista os atalhos globais.

**App desktop: bandeja e atalhos.** O ✕ não encerra o app: ele vai para o ícone da bandeja (perto do relógio), com o cronômetro e os atalhos funcionando. Clique no ícone para abrir; botão direito → **Sair** para fechar de vez. Atalhos que funcionam de qualquer lugar:

| Atalho | O que faz |
| --- | --- |
| `Ctrl+Alt+B` | Mostrar / esconder o app |
| `Ctrl+Alt+N` | Anotação rápida no diário de hoje (Enter salva, Esc cancela) |
| `Ctrl+Alt+F` | Iniciar / pausar o foco |

Na versão de teste, se o app instalado estiver aberto, os atalhos ficam com ele (aparecem em amarelo em ⋯).

**Tópicos** ligam tudo: um hábito, uma tarefa, uma nota ou uma sessão de foco podem pertencer a um tópico, que mantém a mesma cor em todas as janelas e gráficos.

**Filtro por tópico:** escolha um tópico no seletor da barra de cima (ou clique na etiqueta de um tópico em qualquer janela, ou em "Filtrar" na janela Tópicos) e **todas as janelas** passam a mostrar só ele: hábitos, diário, notas, sessões de foco, Hoje e Gráficos. O que você criar enquanto o filtro está ligado já nasce nesse tópico. ✕ tira o filtro.

## Estrutura

```
src-tauri/                 Casca desktop (Rust/Tauri): janela, ícone, instalador
  tauri.conf.json          Nome, tamanho da janela, identificador (não mude o
                           identifier: é ele que define onde os dados ficam salvos)
  src/desktop.rs           Bandeja, atalhos globais, fechar → bandeja
  src/google.rs            Login OAuth no Google + token no Gerenciador de Credenciais
src/
  db/db.ts                 Modelo de dados + banco local (IndexedDB via Dexie)
  focus/FocusContext.tsx   Cronômetro global (continua rodando entre janelas)
  topics/                  Filtro global por tópico (TopicFilter.tsx + context.ts)
  desktop/                 Ponte com o app desktop: atalhos, anotação rápida, lista de atalhos
  google/                  Sincronização em mão dupla com o Google Agenda
  cloud/                   Sincronização em nuvem (Supabase) entre PC e celular
  lib/
    workspaces.ts          Layouts padrão, adicionar/remover janelas
    actions.ts             Regras: marcar hábito, sequência, migrar tarefa
    backup.ts              Exportar/importar JSON
    date.ts, youtube.ts, palette.ts
  workspace/
    WorkspaceCanvas.tsx    A "mesa" com a grade de encaixe (react-grid-layout)
    TopBar.tsx             Abas, + Janela, modos, backup
  windows/
    registry.ts            Catálogo de tipos de janela (registre novas aqui)
    *Window.tsx            Cada módulo
```

**Para criar um novo tipo de janela:** crie `src/windows/MinhaWindow.tsx` recebendo `WindowProps`, adicione o tipo em `WindowKind` (em `db.ts`) e registre em `windows/registry.ts`.

No modo dev, o banco fica acessível pelo console do navegador: `await db.habits.toArray()`.

## Roteiro

1. ✅ MVP: janelas encaixáveis, hábitos, diário, notas, foco + YouTube, gráficos, tópicos, backup
2. ✅ Filtro global por tópico (clicar num tópico filtra todas as janelas)
3. ✅ App desktop (Tauri): ícone, janela própria, instalador, atalhos globais, bandeja do sistema
4. ✅ Google Calendar: eventos do diário ↔ calendário
5. ✅ Sincronização em nuvem (Supabase) entre PC e celular
6. ⬜ Android (Capacitor) + Health Connect para smart band (sono, passos, batimentos)
