---
title: Revisão antes de produção — funções abertas à chave pública e três erros dos logs
aliases: [prontidão para produção, 0135, rpc anon]
tags: [banco, supabase, painel, armadilha]
type: nota
status: stable
custou: medio
codigo:
  - supabase/migrations/0135_rpc_internas_fora_da_api_publica.sql
  - src/app/corretor/(painel)/pessoas/GavetaConversa.tsx
  - src/lib/catalogo/dataDeEntrega.ts
  - next.config.ts
summary: O advisor de segurança mostrou quatro funções security definer que a chave pública chamava sem conferir quem chama; os logs mostraram a gaveta de conversa derrubando Pessoas no SSR, entrega "2027-10" recusada pela coluna date e o carimbo sem sharp.
updated: 2026-10-02
---

# Revisão antes de produção (02/10/2026)

Pergunta do usuário: "o que precisamos melhorar para ir para produção?".
A resposta saiu de medir (advisor do Supabase, logs de runtime da Vercel,
contagens no banco), não de reler o código.

## Funções abertas à chave pública (0135)

O advisor lista `security definer` executáveis pelo `anon`. A maioria
confere quem chama (`eh_gestor`, `auth.uid`) ou é trigger. Quatro não:
`consumir_cota_campanha`, `devolver_cota_campanha`, `resetar_cota_campanha`
e `processar_outbox_analytics_interno`. Com a chave do bundle, qualquer um
esgotaria ou zeraria a cota anti-ban de uma instância. A 0135 deixa as três
primeiras só para `service_role` (quem as chama é o servidor) e tira o
`anon` da de resetar (o painel a chama com sessão). Conferido com
`has_function_privilege` depois de aplicar.

**Régua:** ao criar função `security definer`, ou ela confere quem chama, ou
o `execute` sai de `public`/`anon`. O padrão do Postgres dá `execute` a
`public`, e o Supabase repete para `anon` e `authenticated`.

## Três erros dos logs

- **Pessoas caía com "document is not defined"** quando abria pelo deep link
  `?conversa=`: a conversa chega aberta no HTML do servidor e a gaveta chamava
  `createPortal(…, document.body)` no SSR. Hoje ela só desenha no navegador
  (`useSyncExternalStore` com snapshot de servidor `false`).
- **Importar do site da construtora não gravava a entrega**: a IA devolve
  "2027-10" e a coluna `date` recusa (22007). `dataDeEntrega` completa com o
  dia 1º; o que não é data não é gravado.
- **`/api/imagens/gerar` sem sharp**: o `outputFileTracingIncludes` cobria
  `/corretor/**` e `/documentos/**`, não a rota da API — a arte saía sem a
  ressalva carimbada. Rota incluída.

Fica de fora, anotado: timeout do dossiê (5 em 3 semanas) e rotas
`%5C` (robô pedindo URL com barra invertida).
