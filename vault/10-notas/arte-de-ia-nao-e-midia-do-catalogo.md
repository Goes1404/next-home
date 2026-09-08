---
title: Arte de IA fica vinculada ao imóvel, mas nunca vira mídia do catálogo
aliases: [imagens_geradas.empreendimento_id, ArtesDeIA]
tags: [midia, painel, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [supabase/migrations/0101_arte_de_ia_por_imovel.sql, src/lib/imagens/galeria.ts, src/lib/imagens/pedidoDoCadastro.ts]
created: 2026-09-06
updated: 2026-09-06
fonte: docs/superpowers/specs/2026-09-06-arte-de-ia-no-cadastro-design.md
summary: A 0101 liga a imagem gerada ao empreendimento, mas `midias` continua intocada — é a única fonte de anexo que a assistente pode mandar, e render de modelo não pode chegar no WhatsApp de quem vai visitar o imóvel.
---
# Arte de IA fica vinculada ao imóvel, mas nunca vira mídia do catálogo

A 0101 acrescentou `empreendimento_id` a `imagens_geradas`. Antes o imóvel
existia só como texto dentro do jsonb `briefing` (`imovelSlug`), e texto solto
em jsonb **não é vínculo**: sem integridade referencial, o slug muda quando o
imóvel é renomeado, e "quais artes são deste imóvel" exigia varrer a tabela.

## A linha que não se cruza

`midias` é o catálogo: o que a vitrine pública mostra e a **única** fonte de
anexo que a assistente pode enviar numa conversa. Uma fachada inventada por
modelo chegando no WhatsApp de quem vai visitar o imóvel na semana seguinte é
o defeito que a MEMORIA registra desde agosto — **quem visita confere.**

Então a arte é do CORRETOR: ele acha no editor, leva para post e anúncio à
mão. No cartão do catálogo interno ela pode servir de capa quando o imóvel
não tem foto, sempre com o selo "arte de IA · não é foto". A vitrine continua
dizendo que não há foto.

`on delete set null`, não `cascade`: excluir o imóvel não apaga a imagem —
ela já foi paga e volta a ser peça avulsa da galeria.

Ver também [[ficha-do-prompt-completa-e-com-ausencias]] (o mesmo cuidado do lado
do texto) e [[capa-de-empreendimento-nunca-e-nula]] (o defeito encontrado ao
implementar isto).
