# Versões

O número da versão do app fica em `src-tauri/tauri.conf.json` (`"version"`). O instalador gerado leva esse número no nome (ex.: `Bullet Point_0.1.0_x64-setup.exe`).

Formato: a mudança mais recente fica no topo. Cada item diz o que mudou **para quem usa o app**.

## [Não publicado]

(nada ainda)

## 0.1.4 (2026-11-25)

### Novo
- **Filtro global por tópico.** Escolha um tópico na barra de cima e todas as janelas mostram só ele: Hábitos, Diário (inclusive o aviso de tarefas atrasadas), Notas, sessões de Foco, Hoje e Gráficos. Também dá para ligar clicando na etiqueta de um tópico em qualquer janela ou no botão "Filtrar" da janela Tópicos.
- Com o filtro ligado, hábitos, tarefas, notas e sessões novas já nascem no tópico filtrado.
- O filtro continua ligado ao reabrir o app. Se o tópico for excluído, o filtro sai sozinho.

## 0.1.3 (2026-11-25)

### Mudou
- **O app não usa mais a barra de título do Windows.** A barra de cima do app faz esse papel: arraste pelas áreas vazias para mover, clique duplo para maximizar/restaurar, e os botões ─ □ ✕ ficam no canto direito. Redimensionar pelas bordas continua igual.

### Corrigido
- **Arrastar o app às vezes não funcionava.** Medido: depois de clicar dentro da página, o arraste pela barra do Windows falhava em 7 de 8 tentativas. Pela barra do app: 5 de 5, inclusive tirando do maximizado.

## 0.1.2 (2026-11-25)

### Corrigido
- **O app parava de responder a cliques** depois de arrastar a barra de título (ex.: tirar do maximizado). O app continuava rodando, mas nada funcionava. Causa: o Windows ficava "segurando" o mouse na janela principal porque o "soltou o botão" se perdia entre a janela e a página (WebView2). Agora o app percebe isso em meio segundo e solta o mouse sozinho.

## 0.1.1 (2026-11-25)

### Novo
- **Selo TESTE**: a versão de teste (`npm run desktop`) mostra uma faixa laranja e o selo TESTE no topo, e "TESTE" no título da janela, para não confundir com o app instalado.

### Corrigido
- **Janelas travavam ao arrastar no modo Livre.** Agora a janela vai para onde você soltar e as que estiverem no caminho descem só o necessário. Se você continuar arrastando, elas voltam ao lugar.
- **Redimensionar** em direção a uma janela vizinha também não trava mais: a vizinha desce.

### Melhorado
- Ao sair do maximizado, o app volta com **1280×800** (antes 1600×950, quase a tela toda). Assim a borda de baixo não some atrás da barra de tarefas e dá para redimensionar.

## 0.1.0 (2026-11-24)

### Novo
- **App desktop (Tauri)** com ícone próprio, janela maximizada e instalador para Windows.
- **Botão ▦ Organizar**: junta as janelas no topo, sem buracos nem sobreposições.

### Melhorado
- Abrir, arrastar e redimensionar ficaram mais rápidos (menos animação, conteúdo das janelas não é redesenhado à toa).
- O app abre já desenhado, sem piscar em branco.

### Corrigido
- Layout quebrado no modo Livre (buracos e janelas sobrepostas). Sobreposições antigas são corrigidas ao abrir.
- Duas alterações rápidas seguidas numa janela não se sobrescrevem mais.

## MVP (2026-11-24)

- Mesa com janelas arrastáveis e redimensionáveis em grade, vários espaços de trabalho em abas, modos Livre / Auto-encaixe e travar.
- Janelas: Foco (cronômetro/pomodoro), YouTube, Hábitos, Diário (bullet journal com migração de tarefas), Notas, Gráficos, Tópicos, Hoje.
- Tópicos ligam hábitos, tarefas, notas e sessões de foco.
- Backup: exportar e importar `.json`.
