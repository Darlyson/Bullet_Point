# ◆ Bullet Point

App de produtividade "tudo vinculado": hábitos, bullet journal, notas, sessões de foco com cronômetro + YouTube e gráficos de evolução, organizados em um **espaço de trabalho com janelas** que você arrasta, redimensiona e encaixa onde quiser.

## Rodar

```bash
npm install
npm run desktop        # app desktop (Tauri) com recarga automática ao editar o código
npm run desktop:build  # gera o instalador em src-tauri/target/release/bundle/nsis/
npm run dev            # só no navegador: http://localhost:5173
npm run build          # checa tipos e gera a versão web em dist/
```

O app desktop precisa de [Rust](https://rustup.rs) e do Visual Studio com "Desenvolvimento para desktop com C++" (pré-requisitos do [Tauri](https://tauri.app/start/prerequisites/)).

> ⚠ No Windows, rode os comandos do desktop pelo **PowerShell** ou CMD, não pelo Git Bash. O comando `link` do Git Bash esconde o `link.exe` da Microsoft e a compilação falha com "link: extra operand".

> **Os dados do app desktop e do navegador são separados.** Cada um tem seu próprio banco local. Para levar dados de um para o outro, use **⋯ → Exportar** num e **Importar** no outro.

## Como usar

- **Arrastar janela:** segure pelo título.
- **Redimensionar:** pelas bordas (direita, esquerda, baixo) ou pelo canto inferior direito.
- **Maximizar:** clique duplo no título (ou no botão □).
- **+ Janela:** adiciona módulos. Você pode abrir mais de uma janela de Notas, Hábitos etc.
- **✥ Livre / ⇧ Auto-encaixe:** no modo livre a janela fica onde você soltar. No auto-encaixe as janelas sobem e se empilham sozinhas.
- **🔓 Editar / 🔒 Travado:** trava o layout para não mover nada sem querer.
- **Abas no topo:** cada aba é um espaço de trabalho (ex.: "Estudo", "Manhã"). Clique duplo renomeia, botão direito exclui.
- **⋯:** exporta ou importa um backup `.json` de todos os dados.

**Tópicos** ligam tudo: um hábito, uma tarefa, uma nota ou uma sessão de foco podem pertencer a um tópico, que mantém a mesma cor em todas as janelas e gráficos.

## Estrutura

```
src-tauri/                 Casca desktop (Rust/Tauri): janela, ícone, instalador
  tauri.conf.json          Nome, tamanho da janela, identificador (não mude o
                           identifier: é ele que define onde os dados ficam salvos)
src/
  db/db.ts                 Modelo de dados + banco local (IndexedDB via Dexie)
  focus/FocusContext.tsx   Cronômetro global (continua rodando entre janelas)
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
2. ⬜ Filtro global por tópico (clicar num tópico filtra todas as janelas)
3. ✅ App desktop (Tauri): ícone, janela própria, instalador. ⬜ atalhos globais, bandeja do sistema
4. ⬜ Google Calendar: eventos do diário ↔ calendário
5. ⬜ Sincronização em nuvem (Supabase) entre PC e celular
6. ⬜ Android (Capacitor) + Health Connect para smart band (sono, passos, batimentos)
