---
title: FK do embed de leads é explícita
aliases: [PGRST201 na lista de leads, embed ambíguo de corretores]
tags: [crm, banco, armadilha]
type: armadilha
status: evergreen
custou: medio
codigo:
  - src/lib/corretorSessao.ts
  - src/lib/crm/dadosLead.ts
  - src/lib/crm/embedsAmbiguos.test.ts
created: 2026-10-22
updated: 2026-10-22
fonte: incidente de produção, digest 1879172430 e resposta PGRST201 da API
summary: Depois da 0206, leads tem duas FKs para corretores; todo embed do responsável deve usar corretores!leads_corretor_id_fkey.
---
# FK do embed de leads é explícita

A migration 0206 acrescentou `leads.anuncio_pago_por`, criando uma segunda
relação entre `leads` e `corretores`. O select antigo
`corretor:corretores(...)` passou a falhar em runtime com `PGRST201`: o
PostgREST não sabe se deve seguir `corretor_id` ou `anuncio_pago_por`.

Em produção, isso derrubou `/corretor/leads` com o digest `1879172430` e
também deixaria a ficha do lead vulnerável ao mesmo erro. O responsável do
lead é sempre embutido assim:

`corretor:corretores!leads_corretor_id_fkey(...)`

A guarda `embedsAmbiguos.test.ts`, que já cobrava a FK explícita de
`empreendimentos`, agora também cobra a de `corretores`. Build e tipos não
detectam essa classe de defeito; a prova decisiva é executar o select contra
o PostgREST com uma sessão real.

Relacionadas: [[roleta-dos-anuncios]] · [[MOC — CRM e Painel]]
