---
title: O corretor cadastra a campanha paga e vê qualidade, custo e comparação
tags: [campanhas, crm, meta, banco]
type: decisao
status: growing
custou: baixo
codigo:
  - supabase/migrations/0132_campanhas_do_corretor.sql
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/
  - src/app/corretor/(painel)/_componentes/graficos/OrigemDosLeads.tsx
created: 2026-09-30
updated: 2026-09-30
summary: A tela de impulsionamentos só mostrava anúncio que o webhook detectava, sem como cadastrar campanha, sem qualidade do lead e sem comparação. Agora (0132) o corretor cria campanha com canal, valor e período, coloca anúncios detectados dentro dela e liga clientes de outros canais; cada cartão mostra a qualidade pela temperatura da IA e o custo por cliente, por visita e por cliente quente/morno, e um gráfico compara as campanhas pela mais barata por cliente, marcando a melhor por visita.
---

# Campanha cadastrada pelo corretor

Relato de 30/09/2026: na página de anúncios o corretor não conseguia
cadastrar campanha nem informar o valor dela, e não havia gráfico de
qualidade do lead, de quanto cada um estava custando nem comparação entre
campanhas. Até a 0127, a linha só nascia quando o webhook reconhecia o
primeiro cliente de um post impulsionado.

## O que mudou (0132)

- **Campanha manual**: `criada_pelo_corretor`, `canal`, `inicio`, `fim`. A
  chave é `manual:<uuid>` e a policy de INSERT exige esse prefixo, senão o
  corretor poderia forjar a linha de um anúncio da Meta. Só a campanha manual
  pode ser apagada pela tela.
- **Agrupar**: `agrupado_em` põe um anúncio detectado dentro de uma campanha
  do mesmo corretor. Os clientes e o gasto dele passam a contar na campanha e
  ele sai da lista de cima. Um nível só (constraint). Anúncio agrupado numa
  campanha que sumiu volta para cima, em vez de sumir com os clientes.
- **Ligar cliente**: `leads.impulsionamento_id` para quem veio de Google,
  portal ou panfleto. Campanha manual não pega lead pelo id da Meta, só pelo
  vínculo ou pelos anúncios agrupados.

## Qualidade e comparação

- Qualidade = `lead_observacoes_ia.temperatura_label` (quente, morno, frio) e
  "sem leitura" para quem ainda não conversou. Custo por cliente quente/morno é
  o número que diz se o dinheiro trouxe gente que vale a conversa.
- Comparação: só entra quem tem gasto e cliente. Ordenada pelo custo por
  cliente; a marcada como melhor é a de menor custo por **visita**, porque
  cliente barato que não visita é o anúncio que parece bom e não vende.
- O gráfico de origem dos leads soma só o gasto de campanhas sem canal ou de
  Instagram/Facebook no canal "anúncio": Google e portal trazem clientes por
  outro canal.

## Verificado

Grants conferidos com `has_column_privilege`: `anon` sem nada; o
`authenticated` insere `canal` mas não `meta_ad_id`, nem troca o dono.
Inserir campanha manual com sessão fingida passou; chave de anúncio forjada
levou erro de RLS. Tela olhada com dados de exemplo em 390 e 1280 px, sem
estouro de largura.

Ver também [[impulsionamento-do-corretor-pela-etiqueta-da-meta]].
