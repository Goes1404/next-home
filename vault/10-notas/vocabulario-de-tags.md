---
title: Vocabulário de tags do vault
aliases: [tags, taxonomia]
tags: [meta]
type: nota
status: evergreen
custou: baixo
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: convenção do vault
summary: Lista fechada de tags. Toda nota usa uma tag de DOMÍNIO e uma de NATUREZA. Nada fora daqui.
---
# Vocabulário de tags

Tag nova só entra depois de existirem **três** notas que a usariam. Tag que
sobra vira ruído e quebra os dashboards, que filtram por tag.

## Domínio (escolha 1 ou 2)

| tag | cobre |
|---|---|
| `infra` | Vercel, deploy, variáveis de ambiente, runtime |
| `supabase` | projeto, storage, auth, pg_cron |
| `banco` | schema, migrations, policies, grants, funções SQL |
| `whatsapp` | provedor Evolution, envio, conexão, pareamento |
| `ia` | agente, provedores de LLM, dossiê, telemetria |
| `prompt` | conteúdo do prompt, regras de conversa, voz |
| `anti-ban` | espaçamento, cota, disjuntor, janela, aquecimento |
| `campanhas` | fila, disparo, follow-up |
| `crm` | leads, funil, tarefas, linha do tempo |
| `painel` | telas do corretor e do gestor |
| `front` | site público, vitrine, institucional |
| `gsap` | animação, parallax, camadas, scroll |
| `mapa` | Leaflet, globo, geocodificação |
| `midia` | fotos, plantas, vídeo, PDF, Drive, storage |
| `eval` | evals, benchmarks, juízes, golden dataset |
| `teste` | vitest, Playwright, testes que leem código |
| `seo` | metadados, sitemap, domínio |
| `admin` | papéis, gestor, guardas |
| `lgpd` | privacidade, consentimento, retenção |
| `meta` | sobre o próprio vault |

## Natureza (escolha exatamente 1)

| tag | quando usar |
|---|---|
| `armadilha` | comportamento que engana; custou tempo para descobrir |
| `decisao` | escolha deliberada, com alternativa descartada |
| `medicao` | número que saiu de medição real, não de palpite |
| `licao` | regra geral, aplicável fora do caso que a originou |
| `runbook` | procedimento passo a passo |
| `arquitetura` | onde as peças moram e como se ligam |
| `moc` | mapa de conteúdo |

## Propriedades obrigatórias

`title`, `tags`, `type`, `status`, `created`, `updated`, `summary`.

- `status`: `seedling` (rascunho) · `growing` (em uso) · `evergreen` (estável)
- `custou`: `alto` · `medio` · `baixo` — quanto tempo custou descobrir. É o que
  ordena a leitura de quem chega novo.
- `codigo`: lista de caminhos de arquivo que a nota descreve.
- `fonte`: de onde o fato veio (`docs/MEMORIA.md — seção`, medição, incidente).

## Relacionadas
- [[Home]]
