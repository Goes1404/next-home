---
title: MOC — Infraestrutura
tags: [moc, infra]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-10-21
summary: Vercel, deploy, variáveis de ambiente, sharp, runtime.
---
# Infraestrutura — Map of Content

Vercel (plano Hobby), deploy e runtime.

## Deploy
- [[dominio-proprio-nexthomeimoveis]] — virada para o domínio próprio: DNS antes, NEXT_PUBLIC_SITE_URL depois (04/10)
- [[producao-pode-servir-commit-de-outra-branch]] — o que está NO AR pode não estar em branch nenhuma; a prova é funcional (16/09)
- [[branch-de-producao-nao-e-main]] ⚠️ ler primeiro
- [[ci-vermelho-quinze-dias-pela-catraca-de-bundle]] — o deploy não espera o CI; vermelho vira paisagem (28/09)
- [[push-na-branch-de-producao-dispara-workflows-de-catalogo]] ⚠️ workflows do Actions com `paths` rodam contra PRODUÇÃO quando o merge muda o script; `publicar-fila` republica rascunho. Desabilitar antes (19/10)

- [[o-hobby-aceita-quatro-crons]] ⚠️ medido em 11/09: quatro crons passam
- [[deploy-recusado-nao-aparece-no-historico]]
- [[cron-do-hobby-e-1x-por-dia]]
- [[env-var-nova-so-vale-depois-de-redeploy]]
- [[credencial-de-terceiro-se-confere-antes-de-subir]] — token e ID de serviço externo se julgam ANTES do redeploy; `npm run meta:diag` (11/09)

## Runtime
- [[sharp-na-vercel-o-binario-nao-chega]]
- [[constante-compartilhada-mora-em-modulo-sem-nativo]]
- [[erro-que-so-existe-no-runtime-se-investiga-no-runtime]]
- [[uma-piscada-do-banco-derrubava-a-home]] — Gateway Timeout de segundos virava 500 na home; repetir, nunca degradar (10/09)
- [[otimizador-de-imagens-tem-cota-no-hobby]] ⚠️ foto quebrada com o arquivo no Storage: 402 da cota do otimizador; imagens saem sem otimização (09/10)
- [[menos-bytes-sem-perder-os-efeitos]] — 12/10: no lugar do `unoptimized`, loader próprio sobre variantes WebP que já estão no Storage (sem cota, sem redimensionar na requisição); vídeos cortados com `-c copy`
- [[a-aba-aberta-e-que-carrega-a-versao-antiga]] — não é cache de HTML (sai `no-store` em toda rota): quem segura a versão antiga é a aba que nunca renavegou (15/09)

## Performance
- [[o-site-e-lento-por-desenho-nao-por-peso]] — `proxy.ts` chama `getUser()` em toda requisição; `cookies()` no layout raiz torna tudo dinâmico; função em iad1, banco em ca-central-1 (13/09)
- [[o-site-publico-nao-vai-mais-ao-banco-por-requisicao]] — F2: cache de dados por etiqueta, proxy sem Auth no público, poster no SSR; TTFB da home 0,9–2,9 s → 0,37–0,54 s (13/09)
- [[plataforma-multi-grupo]] — decisão (18/10): uma plataforma só, vários grupos (imobiliárias e corretores independentes); Next Home vira o grupo 1
- [[cobranca-manual-e-suspensao]] — a plataforma registra o pagamento à mão; 5º dia de atraso (ou suspensão manual) para IA, listas, artes e vídeos, derivado na leitura, sem cron (0207, 21/10)
- [[encerramento-do-grupo-e-pedido-do-titular]] — planilha do grupo (gestor e plataforma), pedido do titular (LGPD) e cancelamento com 90 dias; rotina desligada até `APAGAR_GRUPOS_CANCELADOS=1` (0202)
- [[site-de-cada-grupo-pelo-endereco]] — sites por endereço (fase 3 enxuta, 20/10): `enderecos_do_site` (0201), proxy sem banco, passo a passo em docs/SITES-POR-ENDERECO.md
- [[chave-de-servico-classificada-por-grupo]] — todo uso da chave de serviço num mapa por categoria (por-id, equipe, agrega-por-grupo, cruza-conjuntos, plataforma), cobrado por guarda que lê o código (19/10)
- [[convite-por-link-no-nosso-dominio]] ⚠️ fase 2A: convite e recuperação por `token_hash` no nosso domínio, gasto só num botão (scanner de e-mail); criar senha sem a atual só na sessão do link (amr `otp`, 15 min); `*` do ilike sem escape no PostgREST; OTP de 24 h é configuração de produção (19/10)
- [[a-casca-estatica-sem-perder-o-tema]] — F2b: 11 das 14 páginas públicas servidas do cache (ISR 1 h); tema por script antes da pintura e cookie gravado no navegador; fundo do corretor como ilha; sem `cacheComponents` (12/10)
- [[next-home-e-o-espelho-da-versao-geral]] — SUBSTITUÍDA em 18/10: era uma instalação por cliente (26/09)
- [[o-orcamento-do-dossie-era-menor-que-o-escrito]] — E2E diário contra o site no ar (`e2e.yml`); senhas vazadas só no Supabase Pro (02/10)

## Relacionados
- [[MOC — Banco de Dados]] · [[Home]]
