---
title: O ADM tem tudo, menos a conversa de outro corretor
tags: [admin, lgpd, whatsapp, banco, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0134_adm_nao_le_conversa_alheia.sql
  - src/lib/admin/numerosDaEquipe.ts
  - src/lib/admNaoLeConversa.test.ts
  - src/app/corretor/(painel)/admin/whatsapp/acoes.ts
created: 2026-09-30
updated: 2026-09-30
summary: Separação de perfis de 30/09/2026. O corretor mantém catálogo e marketing completos, vê só as próprias campanhas pagas, as próprias vendas e o ranking, e não exclui lead. O ADM vê leads, funil e a leitura da IA da equipe, exclui leads e desconecta números, mas desde a 0134 a RLS não o deixa ler conversa, mensagem, telemetria nem correções de outro corretor. As contagens da equipe saem pela chave de serviço, só com id, data e número.
---

# O ADM tem tudo, menos a conversa de outro corretor

Decisão do usuário em 30/09/2026, depois de uma rodada de perguntas.

## O que cada perfil faz

| | Corretor | ADM (`gestor`) |
|---|---|---|
| Imóveis | tudo (criar, editar, importar, ordem) | tudo |
| Marketing | tudo; Anúncios pagos só os dele | tudo; vê as campanhas de todos |
| Financeiro | próprias vendas, extrato, meta e ranking | + Desempenho da equipe |
| Leads | os dele; arquiva, não exclui | todos; exclui; troca o dono |
| Conversas | as dele | **só as dele** |
| WhatsApp dos outros | — | vê o status e desconecta; não mexe no tom da IA |

## Por que a conversa ficou de fora

O número pareado costuma ser o WhatsApp PESSOAL do corretor, e a 0031
tinha aberto conversa, mensagem e telemetria para o gestor. Foi por isso
que a promoção do Eduardo foi desfeita em 12/09. Agora a regra mora na RLS
e não na tela: esconder a tela deixaria a chave pública alcançando as
mensagens pela API.

## O que custou tempo

- **Havia policy no banco que não está em migration nenhuma.**
  `whatsapp_conversas` tinha TRÊS policies, e duas (uma lendo
  `papel = 'gestor'` direto) só existiam em produção, assim como a policy do
  dono de `corretor_whatsapp_instancias`. Ao fechar acesso, listar
  `pg_policies` da tabela, não só o que as migrations criam. A 0134 derruba
  as de fora e recria as do dono, para o repositório descrever o banco.
- **Painel da equipe precisa de CONTAGEM, não de conteúdo.** Admin, uso das
  novidades, WhatsApp da equipe, Desempenho e Anúncios pagos contam
  conversas e falas de todos. Passam por `clienteParaNumerosDaEquipe()`
  (confere o papel e devolve a chave de serviço), e a guarda cobra que
  quem usa esse cliente não peça coluna com texto.
- **O lead do outro aparece para o ADM como lead, sem prévia.** A view
  `pessoas_do_corretor` é `security_invoker`: sem enxergar a conversa, o
  lado "lead sem conversa" da união passa a mostrá-lo. É o comportamento
  desejado (ficha e leitura da IA, sem mensagem), e veio de graça.
- **Teste de RLS em produção que termina em `raise exception`**: dá para
  aplicar a migration, criar dados sintéticos, trocar de papel e medir
  dentro de uma transação, e a exceção final devolve o resultado E desfaz
  tudo. Com `rollback` no fim, a ferramenta só devolveria o resultado do
  rollback.

## Guarda

`src/lib/admNaoLeConversa.test.ts` repassa as migrations em ordem e
reprova policy viva com `eh_gestor()` nas tabelas de conversa; confere que
só o ADM exclui lead; e lê o código de quem usa a contagem da equipe.
Provocada nas três pontas, com md5 conferindo a mordida.

Ver [[acesso-de-corretor-so-existia-para-um]] e
[[totais-dos-anuncios-contam-e-dividem-o-mesmo]].
