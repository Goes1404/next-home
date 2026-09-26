---
title: Link de anúncio é rodízio aleatório por produto
tags: [crm, whatsapp, banco, decisao]
type: nota
status: stable
custou: baixo
codigo: supabase/migrations/0117_sem_especialista_e_link_rotativo.sql
created: 2026-09-26
updated: 2026-09-26
summary: Desde a 0117 o porteiro /wa/<campanha> sorteia entre os corretores com WhatsApp conectado e manda para o fim quem recebeu o último clique daquele imóvel. O "especialista do imóvel" (bônus da 0115 na roleta e a seção do Desempenho) foi removido.
---

# Link de anúncio é rodízio aleatório por produto

Decisão de produto de 26/09/2026: nada de "especialista do imóvel". Os links
de cada produto são rotativos e aleatórios.

- **`sortear_corretor_whatsapp(p_empreendimento)`**: entre quem tem WhatsApp
  conectado (continua sendo FILTRO — a função devolve o número de destino),
  ordena por "recebeu o último clique deste imóvel?" e depois `random()`.
  Com dois ou mais conectados, o mesmo corretor nunca pega dois cliques
  seguidos do mesmo produto; com um só, ele pega todos.
- **O "último clique" vem de `cliques_whatsapp`**, que a rota já gravava
  (`origem = 'anuncio/<campanha>'`). Nenhuma tabela nova.
- **Deixou de seguir a carga da roleta de leads.** Até a 0094 as duas contas
  tinham de ser iguais; agora são regras diferentes de propósito, e a guarda
  de `roletaDeLeads.test.ts` cobra a nova (sorteio + rodízio, sem `leads` nem
  vendas).
- **A roleta de leads (`distribuir_lead`) voltou à da 0093**: sem desconto
  por venda. Guarda reprova se ela voltar a consultar vendas.
- **A rota tolera o banco sem a 0117**: se a chamada com parâmetro falhar,
  usa a função antiga em vez de perder o clique pago.
- **Armadilha do teste**: `ultimaDefinicaoDe` procurava
  `function public.x(` e acharia o `grant execute on function public.x(`
  que vem depois da definição. Ancorado em `create or replace`.
