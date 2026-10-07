---
title: O imóvel não tem mais corretor dono
aliases: [fim do corretor dono, porteiro do site, 0129]
tags: [front, whatsapp, decisao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/linkDoPorteiro.ts, src/lib/whatsapp/destinoDoPorteiro.ts, src/app/wa/route.ts, src/app/wa/[campanha]/route.ts, src/app/semCorretorDono.test.ts, supabase/migrations/0129_empreendimento_sem_corretor_dono.sql, supabase/migrations/0130_sorteio_prefere_o_corretor_do_link.sql]
created: 2026-09-28
updated: 2026-09-28
fonte: decisão do dono do produto em 28/09/2026 ("tire do site e tire de tudo")
summary: Todo botão de WhatsApp do site passa pelo porteiro (/wa ou /wa/<imóvel>), que sorteia entre quem tem número conectado e manda a mensagem que o webhook reconhece. Empreendimento perdeu o campo corretor e a coluna corretor_id caiu (0129). Exceções declaradas - página/cartão do corretor e páginas por token.
---
# O imóvel não tem mais corretor dono

## Por quê

A 0117 tirou o dono da roleta e do link de anúncio, mas o SITE seguia
abrindo o WhatsApp no número do dono cadastrado. Medido em 28/09: dos 18
imóveis com dono, **14** apontavam para corretor sem número conectado. A
mensagem ia para o celular pessoal dele, e desde a 0111 o CRM nem veria o
lead mesmo se fosse para um número conectado, porque o texto montado à mão
não era o que o porteiro reconhece.

## Como ficou

- `linkDoPorteiro({ imovelSlug?, intencao?, complemento? })` monta
  `/wa/<imóvel>` ou `/wa` com `?i=`, `?m=` e `de=site`.
- `/wa` (porta geral, nova) e `/wa/<imóvel>` sorteiam entre quem tem número
  conectado, gravam o clique (`site/...` × `anuncio/...`) e redirecionam com
  a mensagem reconhecida. Sem ninguém conectado → `/contato`.
- `?m=` é emendado DEPOIS da frase reconhecida (o porteiro casa pelo
  começo) — é por onde o simulador manda a conta.
- `Empreendimento` não tem mais `corretor`; o embed saiu do select; a página
  do corretor mostra o catálogo; o cartão perdeu a atuação; o inbound de
  e-mail não herda dono do imóvel.
- 0129 dropou `empreendimentos.corretor_id`, DEPOIS do deploy que parou de
  ler a coluna. O mapeamento antigo (18 imóveis) está no comentário da
  migration.

## Exceções declaradas

A guarda `semCorretorDono.test.ts` permite `wa.me` direto só onde o
visitante escolheu uma PESSOA (página e cartão do corretor) ou já é lead
(portal, proposta, seleção, documentos).

## O link pessoal voltou a direcionar (0130)

Sem o dono, o cookie do link pessoal (`?corretor=<slug>`) deixou de mandar o
WhatsApp para o corretor — a preferência tinha sido descartada junto com a
0113 (ver [[migration-aplicada-fora-da-branch-e-apagada-pela-outra]]). A
0130 devolveu: `sortear_corretor_whatsapp(p_empreendimento, preferido)`, e as
duas portas do porteiro passam o corretor do cookie. **Preferência na
ORDEM, nunca filtro**: corretor do link desconectado não ganha a vez, e o
clique cai no sorteio (conferido no banco: preferido desconectado → Bruna).

## Custo aceito

Com um único número conectado (Bruna, em 28/09), todo lead do site sem link
pessoal vai para ela.

Ver [[botoes-do-site-mandavam-texto-que-o-porteiro-nao-reconhecia]].

## O link pessoal deixou de ser só preferência (07/10/2026)

- Com a 0130 o corretor do link pessoal só GANHAVA A VEZ no sorteio. Número
  dele desconectado ou ele em pausa, o clique ia para outro corretor, e quem
  divulgou o próprio link perdia o cliente.
- Agora `/wa` e `/wa/<imóvel>` consultam primeiro `numeroDoLinkPessoal`: o
  número conectado na plataforma e, sem ele, o WhatsApp do perfil. O sorteio
  só roda para quem chegou sem link pessoal (anúncio pago, site direto).
- Custo aceito: com o número do corretor desconectado, o cliente cai no
  WhatsApp do perfil, fora da plataforma. A IA não atende e o lead não nasce
  sozinho no CRM. Guarda em `numeroDoLinkPessoal.test.ts`.
