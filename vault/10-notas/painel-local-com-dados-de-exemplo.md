---
title: Painel local com dados de exemplo (para ver e fotografar telas)
aliases: [fotografar as telas, canalOficialLocal.sql, fotografarCanalOficial.mjs, dados de demonstração local]
tags: [teste, painel, runbook]
type: runbook
status: growing
custou: medio
codigo:
  - scripts/demo/canalOficialLocal.sql
  - scripts/demo/fotografarCanalOficial.mjs
  - scripts/banco/dbTeste.mjs
  - src/lib/supabase/env.ts
created: 2026-11-04
updated: 2026-11-04
fonte: revisão das telas do número oficial com o dono (04/11/2026) — docs/MEMORIA.md, "Telas do número oficial revisadas com dados de exemplo"
summary: Para ver uma tela nova sem produção — painel local contra o banco de teste, com gestora e corretor de exemplo. As variáveis do Supabase TÊM de apontar para o local (sem elas o app cai no Supabase de produção). Rodar o app achou 4 defeitos que testes e tsc não pegavam, um deles já em produção.
---

# Painel local com dados de exemplo

Quando o dono quer **ver** uma tela que ainda não está no ar (ou quando a
mudança precisa ser conferida no app de verdade), o caminho é o painel local
contra o banco de teste. Nada sai do contêiner: sem `WHATSAPP_API_URL` e sem
chave de IA, nenhuma mensagem pode sair; o token da Meta é falso.

## Passo a passo (contêiner da nuvem)

1. Docker: o daemon não sobe sozinho — `dockerd` em segundo plano.
2. `npm run db:teste` (banco do zero com todas as migrations; imprime as
   chaves locais).
3. Dados do canal oficial:
   `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f scripts/demo/canalOficialLocal.sql`
   (gestora e corretor de exemplo, número oficial, 3 modelos, uma lista
   oficial medida, uma lista comum para comparar, 65 clientes, a conversa da
   Carla). A trava recusa banco que já tem corretor.
4. O painel, **com as variáveis explícitas** (sem elas `src/lib/supabase/env.ts`
   cai na URL e na chave pública de PRODUÇÃO):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY do db:teste> \
   SUPABASE_SECRET_KEY=<SECRET_KEY do db:teste> \
   WHATSAPP_OFICIAL_TOKEN=token-falso-so-local \
   npx next dev -p 3000
   ```
   O token falso só faz a tela tratar o número como "com acesso à Meta";
   nenhum botão que chama a Meta é apertado.
5. Fotos: `node scripts/demo/fotografarCanalOficial.mjs <pasta> [gestor|corretor]`.
   Contas: `gestora.demo@nexthome.test` e `corretor.demo@nexthome.test`,
   senha `Demo-Local-2026!` (só do banco local).

## Armadilhas que custaram tempo

- `leads.telefone_e164` é coluna **gerada**: o insert com ela falha.
- O id dos imóveis do catálogo muda a cada `db:teste`: buscar pelo `slug`.
- Cliente que recebeu lista nos últimos 7 dias fica "protegido": com só esses
  leads, a prévia da lista dá **0 pessoas** e o "Continuar" não avança.
- Foto de bloco mais alto que a janela: o menu do topo (`sticky`) e o robô do
  assistente (`fixed`) aparecem no meio. Esconder antes, ou janela alta.
- O Playwright do projeto (1.62) não acha o Chromium do contêiner (1.63):
  `executablePath: /opt/pw-browsers/chromium` (o script já faz).
- O banco local tem `pg_net` e `pg_cron`, mas o único agendamento é
  `arquivar_leads_sem_resposta` (SQL puro); as funções com `net.http_*` só
  configuram agendamentos e ninguém as chama.

## O que a primeira rodada achou (04/11/2026)

Testes e `tsc` passavam; só olhar a tela pegou:
- a prévia do modelo dizia "nossa imobiliária" e o cliente leria "Next Home"
  → [[previa-do-modelo-sai-da-regra-do-envio]];
- **"25 pessoas receberáão"** na prévia de público de toda lista — já em
  produção; corrigido na branch (`quantasPessoasRecebem`);
- a conversa oficial na ficha abria nas mensagens antigas e escondia a
  última do cliente;
- número sem máscara, "— de resposta", "Qualidade: GREEN", concordância.

## Relacionadas
- [[banco-local-reproduzivel-das-migrations]]
- [[lista-pela-api-oficial-da-meta]]
- [[MOC — Runbooks]]
- [[MOC — Infraestrutura]]
