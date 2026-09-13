---
title: Memória da conversa e ficha viva — a IA que lembra, entende o "não" e preenche o CRM
aliases: [memória da conversa, recusa do cliente, campos do corretor, 0110]
tags: [ia, prompt, crm, painel, banco, decisao]
type: nota
status: growing
custou: alto
codigo:
  - supabase/migrations/0110_memoria_da_conversa_e_ficha_viva.sql
  - src/lib/whatsapp/memoriaDaConversa.ts
  - src/lib/whatsapp/recusaDoCliente.ts
  - src/lib/whatsapp/ehPergunta.ts
  - src/lib/whatsapp/fichaDoLead.ts
  - src/lib/whatsapp/quandoExtrair.ts
  - src/lib/whatsapp/jogada.ts
  - src/lib/crm/camposDoCorretor.ts
  - src/lib/crm/filaDeTrabalho.ts
  - src/app/corretor/(painel)/conversas/Chat.tsx
  - scripts/traces/traceRecusa.ts
created: 2026-09-11
updated: 2026-09-13
fonte: pedido do usuário ("não consegue manter uma conversa e nem entender quando o cliente não quer") + medição em produção
summary: Cinco frentes contra "a IA esquece, muda de assunto e não entende o não" — memória em prosa que sobrevive à janela, detector de recusa com quatro consequências, pergunta respondida antes do funil, retomada depois de 72h e a ficha do lead escrita pela IA sem desfazer o que o corretor corrigiu.
---
# Memória da conversa e ficha viva

Spec: `docs/superpowers/specs/2026-09-11-memoria-da-conversa-e-ficha-viva-design.md`
Plano: `docs/superpowers/plans/2026-09-11-memoria-da-conversa-e-ficha-viva.md`

Pedido do usuário, em 11/09/2026: *"precisamos aprimorar a janela de contexto
para as respostas para os nossos clientes, ela não está conseguindo manter uma
conversa e nem entender quando o cliente não quer"* — e, na aprovação do
desenho, uma quinta frente: *"faça a nossa IA atualizar a ficha do usuário
melhor e atualizar todos os pontos quando necessário"*.

## O que estava medido antes de desenhar

- **A recusa era respondida com pergunta de funil.** Caso literal de 01/09:
  *"Oi, boa tarde! No momento não tenho interesse. Obrigada"* → a IA seguiu
  qualificando.
- **A extração só rodava quando a IA RESPONDIA.** Em sete dias: 191 mensagens
  de cliente, 80 respostas da IA, 127 do corretor. Quando quem responde é a
  pessoa, a ficha não aprendia nada. Corrigir custa ~R$ 0,22 por semana.
- **`nome` e `email` não tinham `grant update`**, então o corretor nunca
  conseguiu renomear um lead pelo painel — a 0007 revogou o update da tabela e
  concede coluna a coluna, e essas duas nunca entraram.
- **`nome_cliente` era 0 em 140 conversas**: o nome tem de vir da CONVERSA, não
  de um campo que ninguém preenche.

## As cinco frentes

1. **Memória** (`memoriaDaConversa.ts`) — prosa de até 1.200 caracteres com o
   ESTADO da negociação, escrita pela MESMA chamada que já extrai o dossiê
   (zero chamada nova, zero latência a mais). Ela vai em PRIMEIRO lugar no
   prompt, antes até da identidade: bloco que precisa ganhar de todas as
   outras instruções vai antes de todas as outras instruções.
2. **Recusa** (`recusaDoCliente.ts` + `jogada.ts`) — três famílias
   (`desinteresse`, `ja_resolvido`, `parada`). Desinteresse ganha UMA tentativa
   (`acolher_recusa`, perguntando o motivo); pedido de parada encerra na hora,
   porque insistir com quem pediu para sair é o caminho curto para a denúncia.
3. **Pergunta antes do funil** (`ehPergunta.ts`) — `forcaDaPergunta` devolve
   forte/fraca/não, e não um booleano: a primeira versão booleana roubou do
   funil uma RESPOSTA ("pode ser na planta" virou pergunta e travou a
   qualificação).
4. **Retomada** — acima de 72h a IA confirma se ainda vale em vez de continuar
   como se não tivesse havido intervalo.
5. **Ficha viva** (`fichaDoLead.ts`) — a IA escreve nome, e-mail, renda,
   orçamento, região e dormitórios, com três regras: `null` não apaga, o
   cliente pode mudar de ideia, e **o corretor vence**.

## O que vale além deste recurso

- **Fato e permissão moram em campos diferentes.** `nao_contatar_em` é o FATO
  dito pelo cliente; a etapa é julgamento do funil, e etapa anda e volta —
  bastaria arrastar o cartão para "Novo" e o número de quem pediu para sair
  voltaria para a lista de transmissão. Mesma família de `atendida_em` × 
  `liberado_por_palavra_chave` (0106).
- **Guarda que protege correção humana não é enfeite.** `campos_do_corretor`
  existe porque correção que a próxima mensagem desfaz parece botão quebrado —
  e é assim que alguém para de corrigir.
- **`revoke` de COLUNA não desfaz `grant` de TABELA.** O `revoke all (coluna)
  ... from anon` que a migration ia levar era no-op: `anon` tem SELECT de
  tabela e o Postgres não o desfaz por coluna. Saiu, com a explicação escrita
  no lugar.
- **Trace por PERFIL de cliente, antes de gastar chamada.**
  `scripts/traces/traceRecusa.ts` achou um defeito de produto na PRIMEIRA
  execução: depois de `acolher_recusa`, um "não, obrigada" voltava a
  `convidar_visita`. Custo zero, um segundo.
- **Guarda de ordem pode ser cega sem parecer.** `filaDeTrabalho.test.ts`
  escrevia os pesos à mão "de propósito", mas nada comparava as duas cópias:
  `ordenarFila` usa o peso que o próprio item carrega, então mudar
  `cliente_recusou` de 2 para 4 no código deixava os cinco testes verdes.
  Provado em 11/09 e fechado por `peloCodigo`, que lê o `PESO` da fonte.
- **Não acrescente texto novo à dívida de contraste herdada.** A tira da
  memória copia a paleta do WhatsApp, em que `wa-meta` sobre `wa-barra` dá
  **4,14:1** no tema claro — abaixo de AA. O cabeçalho já vive nisso de
  propósito (fidelidade ao app); texto NOVO, e menor, não entra. Rótulo e
  conteúdo se separam pelo PESO, como o "Você:" da lista do app.

## O que ficou por medir, e por quê

Os três números que a spec mandava conferir depois — recusa respondida com
pergunta de funil, conversas com `memoria` preenchida, campos de ficha
preenchidos — **não puderam ser medidos**: em 12/09/2026 17h28 UTC a base de
produção foi zerada de propósito pelo dono da conta. Ver
[[a-base-de-producao-foi-zerada-em-12-09]].

O que se provou sem banco: os seis traces determinísticos, verdes, incluindo o
da recusa — nenhuma recusa cai no funil e nenhuma PREFERÊNCIA ("não quero na
planta") é tratada como recusa.

## Relacionadas
- [[a-base-de-producao-foi-zerada-em-12-09]]
- [[MOC — IA e Atendimento]]
- [[MOC — CRM e Painel]]
