---
title: O número central cadastra e atualiza lead (onda 1, frente B)
aliases: [cadastrar_lead, atualizar_lead, leadPeloCentral]
tags: [crm, decisao]
type: decisao
status: seedling
custou: baixo
codigo:
  - src/lib/central/tratadores/leads.ts
  - src/lib/crm/leadPeloCentral.ts
  - src/lib/whatsapp/repositorio.ts
created: 2026-10-30
updated: 2026-10-30
fonte: construção da onda 1 do CRM pelo WhatsApp, 30/10/2026
summary: cadastrar_lead e atualizar_lead do número central. A escrita mora em src/lib/crm/leadPeloCentral.ts (o central não escreve no CRM); a duplicidade usa o mesmo miolo da palavra-chave (localizarTelefoneNoGrupo); o lead nasce com origem painel/manual; o desfaz arquiva o cadastro e devolve só o campo que ninguém mexeu depois. Pronto, mas desligado até ONDA_ATUAL = 1.
---
# O número central cadastra e atualiza lead

Parte da onda 1 de [[crm-pelo-whatsapp-numero-central-com-ia]]. Fica
desligado até `ONDA_ATUAL` subir para 1 (até lá responde "ainda não sei").

## Cadastrar (`cadastrar_lead`)

- **Telefone inteiro ou nada.** Menos de 10 dígitos ("o final é 0000") volta
  ao cérebro pedindo o número com DDD, sem proposta. Sem telefone também:
  sem ele não há como conferir duplicidade.
- **Duplicidade pela regra da palavra-chave.** O miolo de
  `cadastrarPelaPalavraChave` virou `localizarTelefoneNoGrupo`
  (`repositorio.ts`), e as duas portas usam ele: carteira de quem pede com
  arquivado junto; outras carteiras só no grupo. Lead do próprio: "já é seu
  cliente X" (avisa se arquivado). De outro: não duplica e diz o nome do dono
  (spec 3.1; a palavra-chave não diz). Confere no `preparar` e de novo no
  `executar` (até 1 h entre a proposta e o "sim").
- **Origem `painel/manual`, não uma nova.** É a pessoa cadastrando à mão, só
  que pelo WhatsApp: fica "trazido pelo corretor" (0200), cai em "Cadastro
  manual" nos gráficos e não dispara a notificação de lead novo para quem
  cadastrou. Origem nova cairia em "Outros" e na regra de origem
  desconhecida. A origem que a pessoa diz ("indicação") vai no texto
  (`leads.mensagem`) junto com a observação; a linha do tempo ganha
  "Cadastrado pelo número central".
- `consentimento_lgpd` fica `false` (ninguém marcou a caixa); os campos
  informados entram em `campos_do_corretor` (a IA não sobrescreve).
- **Desfaz:** o lead volta arquivado, só se ainda é de quem cadastrou.

## Atualizar (`atualizar_lead`)

- Etapa, renda (`renda_mensal`), orçamento (`orcamento_max`), região e
  anotação (linha `nota`, como a do painel). Resumo com antes → depois.
- Corretor só os dele; gestor o grupo, e o resumo diz de quem é o lead.
  O `executar` relê pelo id + grupo (+ dono para corretor).
- "Visita marcada" sem data gravada volta pedindo a visita (mesmo cuidado do
  retorno pelo grupo).
- **Desfaz:** o "antes" é capturado no `executar`. Só volta o campo que ainda
  está como o central deixou (mudança mais nova de outra pessoa fica, e a
  resposta diz). A etapa volta com o `etapa_alterada_em` antigo e uma linha
  de etapa na linha do tempo; a anotação é **apagada** (não marcada).

## Armadilha para quem testar

O `bancoFalso` não roda gatilho: `grupo_id` carimbado pelo banco não existe
na linha falsa. Por isso a nota grava `grupo_id` explícito (é por ele que o
desfaz a acha), e os leads de teste trazem `telefone_e164` à mão.
