---
title: Fechar o ciclo e ligar a plataforma — primeiros passos, proposta, indicação, chaves
tags: [crm, whatsapp, campanhas, painel, decisao, arquitetura]
type: nota
status: growing
custou: medio
codigo:
  - supabase/migrations/0123_indicacao_proposta_e_confirmacao.sql
  - supabase/migrations/0124_confirmacao_segue_a_data_da_visita.sql
  - src/lib/crm/primeirosPassos.ts
  - src/lib/crm/configuracaoDoCorretor.ts
  - src/lib/crm/proposta.ts
  - src/lib/crm/publicoDaCampanha.ts
  - src/lib/whatsapp/respostaAosFollowups.ts
  - src/lib/whatsapp/followupTexto.ts
  - src/lib/admin/relatorioConstrutora.ts
  - src/lib/financeiro/metasDaEquipe.ts
  - src/app/(institucional)/proposta/[token]/page.tsx
  - src/app/api/cron/followups/route.ts
  - docs/LIGAR-ENTRADAS-DE-LEADS.md
created: 2026-09-26
updated: 2026-09-26
summary: O gargalo de produção é adoção (0 leads, 1 de 7 com WhatsApp). Primeiros passos no Início e prontidão da equipe para o gestor. Guia para ligar e-mail dos portais e Meta Ads. Proposta por link com aceite. Confirmação da visita pelo lembrete. Pedido de indicação pós-venda. Lista de compradores até as chaves. Imóvel novo e vale retomar no resumo. Relatório por construtora. Metas da equipe.
---

# Fechar o ciclo e ligar a plataforma

Continuação de [[aprimoramentos-das-oito-funcionalidades]]. A ordem veio de
uma medição, não de gosto: produção com **0 leads, 1 de 7 corretores com
WhatsApp, 2 com login**. Nada do que o sistema faz produz efeito sem lead
entrando e corretor configurado. Por isso o bloco 1 é adoção.

## Adoção

- **Primeiros passos** (`primeirosPassos.ts`): WhatsApp, agenda, perfil,
  carteira. Cada passo diz POR QUE importa, e o cartão some quando tudo está
  feito (cartão sempre verde vira paisagem).
- **Equipe pronta para atender** (visão geral do gestor): o que falta em
  cada corretor e o último acesso. "Nunca entrou" e "sem acesso criado"
  pedem ações diferentes e são estados diferentes.
- `carregarConfiguracao` é uma conta só para as duas telas. O Início usa a
  sessão; o gestor usa a chave de serviço DEPOIS da guarda de papel (a
  agenda de um colega não é legível pela RLS do gestor).
- **Entradas paradas**: e-mail dos portais e Meta Ads estavam prontos e com
  zero linhas. É configuração, não código: [[ligar-entradas-de-leads]].

## Negociação

- **Proposta por link** (`/proposta/<token>`): o CORRETOR escreve o valor
  (a regra "a IA não fala valores" continua). O cliente aceita ou pede
  conversa, e as duas respostas avisam o corretor. Aceitar não muda a
  etapa (`etapaAutomatica.test.ts`). A página diz que não é contrato.
- **Confirmação pelo lembrete da véspera**: `lerRespostaAoLembrete` dá
  prioridade à negação ("não posso" contém "posso"). Em dúvida, nada é
  gravado: uma confirmação inventada deixa alguém esperando no decorado.
  0124: se a data da visita muda, a confirmação é apagada.
- As três respostas a follow-up (pós-visita, lembrete, indicação) passam por
  `instrucaoPelosFollowups`. Vale o follow-up mais recente e só enquanto ele
  foi a última palavra nossa.

## Depois da venda

- **Pedido de indicação**: sai de 5 a 30 dias depois do fechamento, uma vez
  por conversa. A resposta do cliente vai ao corretor, que registra o
  indicado na ficha. O indicado entra com `indicado_por`, origem
  `indicacao` e o mesmo corretor, e o registro exige confirmar que a pessoa
  sabe que será procurada (ela não deu consentimento a ninguém).
- **Compradores até as chaves**: público `compradores` na lista de
  transmissão, restrito ao imóvel da campanha. Pegadinha: o disparo agenda
  reengajamento para quem não responde, e reengajar quem comprou seria
  propaganda. O runner passou a descartar reengajamento de
  `fechado`/`perdido` ANTES de reservar cota.

## Carteira e gestão

- Resumo do dia: imóvel publicado nas últimas 24h e quantos leads combinam
  (a janela é pela CRIAÇÃO do cadastro, então rascunho publicado dias depois
  não aparece). Às segundas, até 5 leads parados há 30+ dias que ainda
  valem mensagem.
- **Relatório por construtora** (Administração → Construtoras): leads,
  visitas (a data OU a etapa, régua da 0072), vendas e VGV. Sem dado de
  cliente, com botão de imprimir ou salvar PDF.
- **Metas da equipe** em Desempenho (gestor): a meta é do corretor, o
  gestor só enxerga, e o ganho usa a conta do Extrato (`repasseDoPeriodo`).

## Coisas que custaram tempo

- A meta por corretor já existia (F5 do financeiro). Faltava só a visão do
  gestor. Medir o que existe antes de construir, de novo.
- Duas guardas de código-fonte afirmavam o texto antigo:
  `selecaoManual.test.ts` (a chamada da prévia ganhou o imóvel) e a
  contagem de subtópicos de Admin (9 → 10). As duas foram reescritas com o
  motivo, não afrouxadas.
- `ConversaPersistida` não tem nome do cliente. O nome do aviso sai do lead.

## Relacionadas
- [[aprimoramentos-das-oito-funcionalidades]]
- [[ligar-entradas-de-leads]]
- [[fluxo-de-campanhas]]
- [[fluxo-do-webhook-whatsapp]]
