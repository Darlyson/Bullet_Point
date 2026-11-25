# Aprendizado: trabalhando com IA neste projeto

Anotações práticas do que funciona (e do que deu errado) ao construir o Bullet Point com ajuda de IA (Claude Code). Atualize sempre que aprender algo novo.

## Como pedir

- **Descreva o sintoma, não a solução.** "A janela trava quando arrasto" é melhor do que "aumenta a animação". A IA investiga a causa; se você já pede a solução, ela pode consertar a coisa errada.
- **Diga onde e como acontece.** Qual janela, qual modo (Livre / Auto), app instalado ou modo dev. Isso corta muito tempo de investigação.
- **Um assunto por vez.** Pedidos misturados funcionam, mas é mais fácil revisar e voltar atrás quando cada mudança vira um commit separado.
- **Peça explicação quando quiser aprender.** "Explica por que travava" rende uma resposta sobre a causa, não só o código pronto.

## Como conferir o que a IA fez

- **Teste no app de verdade.** A IA consegue checar tipos (`tsc`) e simular a lógica, mas não sente o arraste com o mouse. Ela vai dizer o que testou e o que não testou: leia essa parte.
- **Use o modo ao vivo** (`npm run desktop`): cada arquivo salvo aparece no app em menos de um segundo. Gere o instalador só quando quiser levar a versão para o uso diário.
- **Olhe o diff antes do commit** (aba "Source Control" do VS Code). Se não entender uma parte, pergunte.

## Lições deste projeto

| Data | O que aconteceu | Lição |
|---|---|---|
| 2026-11-24 | Build do Tauri falhou duas vezes com "link: extra operand". | No Windows, compilar sempre pelo **PowerShell**, nunca pelo Git Bash (o `link` do Git Bash esconde o `link.exe` da Microsoft). |
| 2026-11-24 | Para corrigir buracos no modo Livre, a IA passou a recusar qualquer posição que encostasse em outra janela. | Uma correção pode criar outro problema: as janelas passaram a travar ao arrastar. Teste o comportamento principal depois de cada correção, não só o bug que foi corrigido. |
| 2026-11-25 | Corrigido o travamento: as janelas no caminho descem e voltam ao lugar se você continuar arrastando. | Quando uma biblioteca não faz exatamente o que você quer, dá para trocar só uma peça dela (aqui, o "compactor" da grade) em vez de reescrever tudo. |
| 2026-11-25 | `npm run desktop` falhou com "Port 5173 is already in use". | Um servidor `vite` antigo tinha ficado aberto de outra sessão. Verifique processos esquecidos antes de achar que o código quebrou. |
| 2026-11-25 | Com o app de teste e o instalado abertos ao mesmo tempo, era fácil confundir os dois. | A versão de teste ganhou o selo laranja **TESTE** no topo e no título da janela. Sem o selo = app instalado. |
| 2026-11-25 | App congelava ao sair do maximizado e redimensionar, mas sumiu sozinho durante a investigação. A medição (posição da janela a cada 40 ms + travadas dentro da página) não registrou nenhuma travada. | Antes de mexer no código, **medir**. Problema que some sem mudança no código costuma vir do PC (drivers, outro programa, Windows), não do app. Se voltar, reproduzir com a medição ligada. |
| 2026-11-25 | Modo dev e app instalado mostravam dados diferentes. | Cada um tem seu próprio banco local. Para testar com dados reais: **⋯ → Exportar** no instalado, **Importar** no dev. |

## Arquivos desta pasta

- `APRENDIZADO.md`: este arquivo.
- `VERSOES.md`: o que mudou em cada versão.
- `PROXIMOS_PASSOS.md`: o que fazer em seguida, em ordem.

Dica: peça à IA para atualizar esses três arquivos ao final de cada sessão de trabalho.
