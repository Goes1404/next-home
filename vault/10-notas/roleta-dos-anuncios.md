---
title: Roleta dos anúncios
tags: [whatsapp, campanhas, meta, crm]
type: decisao
status: evergreen
custou: medio
codigo:
  - supabase/migrations/0204_roleta_dos_anuncios.sql
  - src/lib/whatsapp/roletaDosAnuncios.ts
  - src/lib/whatsapp/roletaTextos.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/EditorDaRoleta.tsx
  - src/app/api/webhooks/whatsapp/route.ts
summary: Lead que nasce pela etiqueta de anúncio da Meta no número de um corretor vai para o próximo da lista dele; o número novo manda a primeira mensagem na hora e o do dono avisa quem vai atender.
updated: 2026-10-27
---

# Roleta dos anúncios

Pedido do dono (20/10/2026). Desenho:
`docs/superpowers/specs/2026-10-20-roleta-dos-anuncios-design.md`.

- **Gatilho:** etiqueta de anúncio da Meta E lead que nasceu nesta mensagem
  (`obterOuCriarConversa` devolve `leadCriadoAgora`). Cliente antigo que
  clica no anúncio fica com quem já atendia.
- **Configuração:** Anúncios pagos → "Roleta dos meus anúncios". O corretor
  configura a do próprio número; o ADM, a de qualquer um do grupo. Lista
  ordenada, o dono pode estar nela, dois textos editáveis com
  `{corretor}`, `{cliente}`, `{imovel}`, `{imobiliaria}`.
- **Escolha atômica:** `proximo_da_roleta` (FOR UPDATE) avança a vez e pula
  inativo, outro grupo e número fora do ar. A vez do próprio dono = o lead
  fica com ele, sem mensagem.
- **Ordem do repasse:** a abertura sai do número de B PRIMEIRO; falhou, B é
  excluído e a roleta tenta o próximo (decisão do dono). Só depois a ficha
  muda de dono (`origem_atribuicao = 'roleta'`, linha `repasse` com a origem
  anterior), a conversa de B nasce com a IA desligada, o número de A manda a
  passagem e B é avisado.
- **Sem limite diário nem intervalo** (decisão do dono): é resposta a quem
  acabou de pedir contato. Risco aceito: primeira mensagem de um número para
  quem nunca falou com ele.
- **Aviso de lead novo** não sai para A quando há repasse;
  `aviso_lead_novo_em` é marcado para o tique não repetir para B.

- **O lead é de quem pagou o anúncio** (decisão de 21/10, 0206): a roleta
  grava `leads.anuncio_pago_por`; se quem recebeu sair da empresa,
  `devolver_leads_da_imobiliaria` devolve o lead a quem pagou (se ativo).

- **Modo "aviso no grupo para ligar"** (0218, 27/10): na tela, cada roleta
  escolhe entre a mensagem do número do corretor (o de cima) e o aviso no
  grupo `NOME & ARETZ`; no modo grupo nenhuma mensagem sai do número do
  escolhido e a roleta exige grupo mapeado, não WhatsApp conectado. Nos dois
  modos `proximo_da_roleta` pula `em_pausa` e `oculta`. No modo mensagem a
  passagem sai ANTES da abertura; quando o lead fica com quem pagou, nada sai
  (a boas-vindas genérica foi tirada em 27/10, ver
  [[lead-da-campanha-do-corretor-sem-ia]]); o webhook passa o modo já lido para a roleta (ler duas
  vezes deixava o cliente sem resposta). Troca de dono que falha não avisa
  ninguém. Ver [[retorno-da-ligacao-pelo-grupo]].

Ligada a [[lead-da-campanha-do-corretor-sem-ia]], [[notificacao-no-celular-do-corretor]].
