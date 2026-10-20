# Fase 2B enxuta — cota de respostas da IA por grupo (20/10/2026)

Escopo decidido com o dono: um limite simples de respostas da IA por grupo
por mês. Sem medidor de custo, sem cobrança, sem pacote extra (ficam para
depois; ver "Fora do escopo").

## Decisões (tomadas sem o dono, registradas aqui e no relatório)

1. **O teto vem do plano** (§10 da spec), em UM módulo puro
   (`src/lib/planos/cotaDaIa.ts`), marcado como provisório: Essencial 1.000,
   Profissional 2.000, Imobiliária 1.500 **por assento**, Preço de custo
   **sem teto** (é o plano da Next Home, grupo 1 — "preço de custo" paga o
   que usar, então teto não faz sentido).
2. **Assento** (provisório até a cobrança da fase 2): número de WhatsApp
   cadastrado no grupo (`corretor_whatsapp_instancias`), mínimo 1. É quem
   pode receber resposta da IA; gestor que não atende não tem número e não
   soma (spec §10: "gestor que não atende não paga assento").
3. **Ajuste da plataforma** substitui o padrão do plano:
   `grupos.teto_respostas_ia` (nulo = padrão do plano). Vale também para o
   grupo 1, se um dia o administrador quiser.
4. **O que conta como resposta**: linha de `ia_interacoes` com
   `acao in ('respondida','visita_confirmada')` e
   `origem in ('webhook','followup','painel')` — o que sai para o cliente no
   WhatsApp. Playground, eval, consultor e assistente do financeiro não
   contam (medidor completo é pendência). Teste pela linha real (`e_teste`)
   conta: ele custa igual.
5. **Contador no banco, por gatilho** em `ia_interacoes` (`after insert`),
   em `uso_da_ia (grupo_id, mes, respostas)`, mês no fuso de São Paulo. Pega
   todo caminho que grava a telemetria, inclusive os que vierem depois.
   Backfill do mês corrente na migration.
6. **Corrida aceita**: a conferência é antes de chamar a IA, a contagem
   depois de enviar. Duas mensagens no mesmo segundo no último degrau podem
   passar 1–2 do teto. "Reservar antes de gastar" (spec §10) entra com o
   medidor único.
7. **Falha ao ler a cota não cala a IA**: "não sei" vira "responde", com log.
   Calar todos os clientes por uma piscada do banco é pior que 1 resposta a
   mais.
8. **No teto**: a IA para de responder (webhook, varredura de respostas
   atrasadas, palavra-chave / "IA assume agora", rascunho ✨), com silêncio
   tipado `cota_do_grupo` em `ia_interacoes`. O corretor atende pelo painel;
   nada se perde (a mensagem continua gravada). O **lembrete de visita**
   continua saindo (conta na cota): é compromisso já marcado e o volume é
   pequeno.
9. **Avisos**: faixa no painel — gestor a partir de 80%; todos quando
   esgota (o corretor precisa saber que agora é com ele). Cabeçalho da
   conversa diz o motivo. Na `/plataforma`, uso por grupo com selo aos 80%.

## Arquivos

- `supabase/migrations/0197_cota_da_ia.sql` — coluna `grupos.teto_respostas_ia`,
  tabela `uso_da_ia` (grupo, gatilhos 00/zz, RLS + policy restritiva, sem
  grant), gatilho `contar_resposta_da_ia`, backfill do mês, ação
  `cota_da_ia_ajustada` em `admin_eventos`.
- `src/lib/planos/cotaDaIa.ts` (+ teste) — teto por plano, mês de SP,
  situação da cota (livre / aviso / esgotada / sem teto).
- `src/lib/planos/usoDaIa.ts` — `lerCotaDaIa(grupoId)` pela chave de serviço
  (helper no mapa de `servicoComGrupo.test.ts`).
- `src/lib/whatsapp/quandoAIaResponde.ts` (+ teste) — motivo `cota_do_grupo`.
- Webhook, `cron/followups`, `aberturaPelaIA.ts` — passam a cota.
- `conversas/page.tsx`, `pessoas/page.tsx`, `chatModelo.ts` — frase do cabeçalho.
- `_componentes/FaixaCotaDaIa.tsx` + layout do painel.
- `src/lib/plataforma/grupos.ts`, `src/app/plataforma/page.tsx`,
  `grupos/[id]/page.tsx`, `acoes.ts` — uso por grupo e ajuste do teto.
- Tipos em `src/lib/supabase/types.ts`.

## Testes

- Puros: `cotaDaIa.test.ts`, `quandoAIaResponde.test.ts` (motivo novo, só
  quando responderia), guarda de código-fonte (webhook, varredura e abertura
  passam a cota).
- Banco: `cotaDaIa.db.test.ts` — gatilho conta só as origens/ações certas,
  no grupo da linha, no mês de SP; `anon`/`authenticated` não leem
  `uso_da_ia`; mapa de funções seguras e isolamento passam.

## Fora do escopo (pendências)

Medidor único de toda chamada paga, reserva antes de gastar, pacote extra,
cobrança, tela "quanto já usei" para o corretor, teto por corretor dentro da
cota da equipe, cota de artes/vídeos/listas, aviso por e-mail/WhatsApp.
