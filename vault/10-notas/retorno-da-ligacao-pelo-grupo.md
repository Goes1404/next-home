---
title: O corretor conta como foi a ligação no grupo dele e o CRM se atualiza sozinho
tags: [whatsapp, crm, ia, arquitetura]
type: arquitetura
status: growing
custou: alto
codigo:
  - src/lib/crm/retornoPeloGrupo/
  - src/app/api/webhooks/whatsapp/route.ts
  - src/lib/whatsapp/roletaDosAnuncios.ts
  - src/lib/crm/enviosDeLeadParaGrupo.ts
  - src/lib/crm/leadsSemRetorno.ts
  - supabase/migrations/0217_roleta_aviso_no_grupo.sql
  - supabase/migrations/0218_retorno_da_ligacao_pelo_grupo.sql
created: 2026-10-27
updated: 2026-10-27
fonte: spec docs/superpowers/specs/2026-10-26-ligacao-primeiro-e-retorno-pelo-grupo-design.md; plano e ledger da execução
summary: Primeiro contato por ligação (Aretz) — roleta avisa no grupo NOME & ARETZ, o corretor responde por texto/áudio no grupo e a IA atualiza ficha, dossiê, etapa e visita; o gestor recebe às 18h quem está sem retorno.
---

# Retorno da ligação pelo grupo

Pedido do dono em 26/10/2026 para a operação da Aretz (primeiro contato por
ligação). Três partes:

1. **Roleta dos anúncios, modo "aviso no grupo"** (0217): o escolhido não
   manda mensagem do número dele; recebe o aviso no grupo e liga. A roleta
   também passou a pular `em_pausa` e `oculta` nos dois modos.
2. **Retorno pelo grupo**: o webhook abre UMA exceção ao descarte de `@g.us`
   — só `messages.upsert`, nunca `fromMe`, **depois** da autenticação, e só
   quando a instância é o número central de um grupo com envio ligado e o JID
   é o grupo de um corretor ativo. O processamento (áudio, IA, gravação,
   resposta) roda em `after()`.
3. **Lista das 18h** ao gestor, no WhatsApp privado, pelo número central.

## Regras que custaram caro

- **Qual lead**: citação do aviso (procurada em TODOS os avisos do corretor,
  não só nos que aguardam) → citação da confirmação (correção) → um só
  aguardando → nome no relato (primeiro nome; empate desfeito pelo nome
  completo) → pergunta numerada. Nunca adivinha.
- **Correção em cadeia** resolve para o ÚLTIMO elo de `corrige_id` e desfaz
  exatamente o que o elo com efeitos aplicou; o relato relido é o original +
  todas as correções.
- **Dossiê**: campo ausente não apaga; listas (exigências, objeções) somam.
- **Funil**: um relato nunca recua etapa nem tira de `fechado`; só chega a
  primeiro_contato, em_conversa, qualificado, visita_agendada ou perdido
  (perdido exige motivo). `nao_atendeu` não grava fatos nem visita.
- **Data da visita** só vale em ISO com fuso; sem fuso vira null (o servidor
  em UTC gravaria 3 h errado).
- **Mensagem do gestor** no grupo é ignorada em silêncio: o autor é
  reconhecido pelo número ou pelo `@lid` guardado na sincronização
  ([[vinculo-do-corretor-no-grupo-e-lid]]).
- **Mensagem do cliente** em lead que está com outro corretor vira aviso no
  grupo do dono (rajada de 8 s, só a mensagem mais nova avisa).

## Antes de publicar

- Aplicar **0217** e **0218** antes do deploy (aditivas). Sem Docker na
  máquina de desenvolvimento, nenhuma das duas rodou em Postgres: rodar
  `npm run db:teste` antes.
- O formato real do participante no webhook da Evolution (`@lid`,
  `participantAlt`) foi testado só com payloads simulados: testar no número
  central com o dono.
- Aretz: escolher o número central, ligar o envio e "Sincronizar grupos"
  (em 26/10 nada disso estava feito). A sincronização nunca casava antes
  desta branch: `nomeDeGrupoAretz` somava " & Aretz" também ao nome do grupo.

Ligada a [[roleta-dos-anuncios]], [[leads-distribuidos-nos-grupos-da-aretz]],
[[audio-do-retorno-na-ficha-e-na-exclusao]].
