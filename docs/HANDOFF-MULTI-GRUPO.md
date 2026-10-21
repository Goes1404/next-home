# Multi-grupo: passo a passo para continuar (handoff)

Escrito em 20/10/2026 para qualquer IA ou pessoa continuar o trabalho de
transformar o CRM da Next Home numa plataforma de várias imobiliárias
("grupos"). Leia este arquivo inteiro antes de mexer em qualquer coisa.

## 1. Onde estamos

- **Produção**: `www.nexthomeimoveis.com` (Vercel, plano Hobby) + Supabase
  `prhhrqyubjcafvucirri`. Tem clientes reais e conversas reais de WhatsApp.
- **Fase 1 (fundação) está no ar** desde 20/10: tabela `grupos`, `grupo_id`
  em todas as tabelas, RLS restritiva por grupo, migrations 0190–0193
  aplicadas. A 0194 (pós-deploy) foi aplicada em 21/10/2026.
- **Depois da fase 1 subiram** (já no ar, migrations 0203–0205 aplicadas):
  notificação no celular, roleta dos anúncios, botões do Início.
- **Fases 2A, 2B, 2D, 4, 5, 3 e Op foram PUBLICADAS em 20–21/10/2026**, nesta
  ordem, com as migrations 0195–0202 aplicadas antes de cada deploy (commit
  final `5fc1a14`). A tabela abaixo fica como registro do que cada uma trouxe.
  O que falta está na seção "Próximos passos".

| Ordem | Fase | Branch @ commit | Migration | Ordem com o deploy |
|---|---|---|---|---|
| 1 | 2A plataforma e convite | `fase-2-plataforma` @ 24c5f1c | 0195, 0196 | migrations ANTES |
| 2 | 2B cota da IA | `fase-2b-cota-da-ia` @ 3026ede | 0197 | ANTES |
| 3 | 2D regras de operação | `fase-2d-regras-de-operacao` @ 4c4e13e | 0198 | ANTES |
| 4 | 4 IA de cada grupo | `fase-4-ia-do-grupo` @ 6a92ffe | 0199 | ANTES |
| 5 | 5 saída do corretor | `fase-5-saida-do-corretor` @ 016922c | 0200 | ANTES |
| 6 | 3 site por endereço | `fase-3-site-por-endereco` @ fe29339 | 0201 | ANTES |
| 7 | Op dados do grupo e LGPD | `fase-op-dados-do-grupo` @ c5d95bc | 0202 | ANTES |

Todas as 0195–0202 são aditivas (conferido em 20/10): nada que o código no ar
usa é retirado. A 0196 revoga `select` de `anon` em `corretores`, mas
concede de volta as 15 colunas que o site lê; conferido contra o código.

### O que cada fase precisa FORA do código

- **2A**: `RESEND_API_KEY` e `EMAIL_REMETENTE` na Vercel; domínio verificado
  no Resend (DNS na Hostinger); URLs do Supabase Auth incluindo
  `<site>/auth/confirmar`; `insert into administradores_da_plataforma` com o
  usuário do dono. Tudo em `docs/CONVITE-E-EMAIL.md` (vem na branch).
- **2B, 2D, 4, 5**: nada externo. 2D faz cada usuário aceitar os termos no
  primeiro acesso. 4: o gestor preenche "Assistente da imobiliária".
- **3**: `DOMINIO_DA_PLATAFORMA` na Vercel (+ Redeploy); domínio curinga
  `*.<domínio>` na Vercel com nameservers na Vercel; cada domínio próprio
  adicionado na Vercel e na tabela `enderecos_do_site`. Ver
  `docs/SITES-POR-ENDERECO.md`. Sem a 0201, host desconhecido dá 500.
- **Op**: `APAGAR_GRUPOS_CANCELADOS=1` liga a rotina dos 90 dias (desligada
  por padrão).

### Pendências conhecidas das fases

- Fase 4: `COMPLEMENTO_QUE_DESARMA` (`recusaDoCliente.ts`) só conhece os
  bairros da Next Home; há um `it.fails` declarado no teste.
- Fase Op: a rotina dos 90 dias não apaga Storage público, instâncias da
  Evolution nem logins do Auth.
- Fase 3: redirecionar o endereço gratuito para o domínio próprio e o painel
  no domínio da plataforma não foram feitos.
- Desenho completo e o que falta depois: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
  e `docs/superpowers/specs/2026-10-19-lacunas-multi-grupo.md`.

- **Fase 2C (cobrança manual e suspensão) publicada em 21/10/2026**, migration
  0207 aplicada: mensalidade e dia de vencimento por grupo, pagamentos
  registrados em /plataforma, aviso no painel desde o vencimento e suspensão
  automática no 5º dia (derivada na leitura, sem cron); suspenso cala IA,
  follow-ups, listas, artes e vídeos. Plano `custo` (Next Home) é isento.
  Plano: `docs/superpowers/plans/2026-10-21-fase-2c-cobranca-manual.md`.

- **Endereço só do CRM: `astroimob.vercel.app`** (21/10/2026), alias do MESMO
  projeto da Vercel (nunca um projeto separado: as rotinas rodariam em dobro).
  Ali a raiz e as páginas do site vão para `/corretor`; `/plataforma` e o
  login abrem normalmente. A Next Home continua entrando também por
  `nexthomeimoveis.com/corretor`. Lista em `src/lib/enderecosDoPainel.ts`
  (+ variável `ENDERECOS_DO_PAINEL`). Redirect URL do Supabase já cadastrada.
  O login (`src/app/corretor/entrar/page.tsx`) mostra a marca AstroImob
  nesse endereço e a Next Home no site (21/10, layout inspirado no Facebook).

- **Marca do grupo no CRM (0208, 21/10/2026, branch `marca-do-grupo-no-crm`,
  ainda NÃO publicada)**: o painel, os avisos ao corretor, os e-mails de acesso
  e os links do cliente usam o nome, a logo e o endereço do grupo; a Next Home
  fica igual (teste que trava). Antes do deploy: aplicar a 0208 (aditiva).
  Variável opcional `PAINEL_URL` (padrão `https://astroimob.vercel.app`).
  Upload da logo em `/plataforma/grupos/[id]` e em Administração → Marca.
  Plano: `docs/superpowers/plans/2026-10-21-marca-do-grupo-no-crm.md`; nota
  `vault/10-notas/marca-do-grupo-no-crm.md`.

## 1b. Próximos passos (depois de 21/10/2026)

1. ~~Aplicar a 0194~~ — aplicada em 21/10/2026 (assinatura antiga do sorteio
   apagada; `anon` sem insert em `leads` e `cliques_whatsapp`; `/wa` conferido).
2. Configurar o que cada fase precisa fora do código (lista acima):
   Resend (2A; o dono é administrador da plataforma desde 21/10, login
   sq1matheusgsilva@gmail.com, SEM ficha de corretor: o login o leva a /plataforma),
   `DOMINIO_DA_PLATAFORMA` e domínio curinga (3), `APAGAR_GRUPOS_CANCELADOS`
   (Op, quando quiser ligar a rotina dos 90 dias).
3. ~~Roleta × saída do corretor~~ — decidido em 21/10: o lead é de quem
   pagou o anúncio (`leads.anuncio_pago_por`, 0206).
4. ~~Textos com o nome da casa usam `site.nome`~~ — trocados pela marca do
   grupo na branch `marca-do-grupo-no-crm` (roleta, notificações, resumos,
   relatórios, lembretes). Falta publicar e conferir:
   - links do CLIENTE dentro da conversa da IA (`resolverMidia.ts`,
     `apresentacaoDigital.ts`) ainda usam o endereço da Next Home; é a fase do
     prompt/guardrails (exceção declarada em `semMarcaFixaNoCrm.test.ts`);
   - `src/app/manifest.ts` e o `favicon.ico` de arquivo são da Next Home; o
     painel de outro grupo declara `icons` e `manifest: null`, mas o
     `favicon.ico` do raiz não obedece;
   - o cliente de um grupo SEM site próprio abre a seleção no endereço do
     painel, sem as páginas de imóvel (não há site para elas);
   - `PAINEL_URL` diferente do padrão exige também listar o host em
     `ENDERECOS_DO_PAINEL`;
   - o `redirectUri` do Gmail segue o endereço do painel do grupo: se o Gmail
     for liberado para outro grupo, cadastrar essa URI no Google Cloud;
   - `VAPID_SUBJECT` (e-mail do push) ainda tem a Next Home como padrão.
5. Itens fora do escopo das fases enxutas: cobrança (2C), medidor de custo
   da IA, mover conta entre grupos, e o resto das lacunas em
   `docs/superpowers/specs/2026-10-19-lacunas-multi-grupo.md`.
6. No worktree principal, rode testes com `npx vitest run --exclude ".claude/**"`:
   há um worktree antigo dentro de `.claude/worktrees/` e o vitest roda os
   testes dele contra o código atual.

## 2. Regras que não se quebram

1. **Nunca** `git push --force`. Publicar = avançar as DUAS branches de
   produção, `main` e `claude/modernizar-plataforma-imobiliaria-2tm13q`, com o
   mesmo commit, só em fast-forward.
2. **Nunca** abrir, imprimir ou commitar `.env` / `.env.local` / chaves.
3. Mudança em produção (migration, dado, push) só com OK do dono.
4. Antes de publicar, conferir quais workflows do GitHub rodam por push
   CONTRA PRODUÇÃO: `git diff --name-only origin/main..HEAD | grep -E '^(scripts/(catalogo|ops|video)/|src/lib/imagens/variantes\.ts|\.github/)'`.
   Se casar, desligar o workflow no GitHub antes (alguns publicam e APAGAM
   imóveis).
5. Gestor/ADM nunca lê conversa de outro corretor; toda tabela nova leva
   `grupo_id`, gatilhos `_00_grupo`/`_zz_grupo_*`, policy restritiva
   `isolamento_por_grupo` e `revoke all` de `anon` e `authenticated`
   (copie o bloco de `supabase/migrations/0204_roleta_dos_anuncios.sql`).
6. Toda tarefa termina atualizando `vault/` (nota em `vault/10-notas/`,
   link num MOC de `vault/20-mocs/`) e uma seção curta no fim de
   `docs/MEMORIA.md`. A MEMORIA tem 700 KB: busque com `grep`, não leia
   inteira.

## 3. Como publicar UMA fase (receita)

Exemplo com a fase 2A. Troque branch e migrations para as seguintes.

```bash
# 1) Trabalhar num worktree próprio, a partir da branch da fase
git fetch origin
git worktree add ../next-home-fase-2a fase-2-plataforma
cd ../next-home-fase-2a
npm ci

# 2) Trazer a produção atual para a branch da fase
git merge origin/main
```

Conflitos esperados e como resolver (juntar as DUAS intenções):

- `docs/MEMORIA.md` e `vault/**`: união (manter as duas seções).
- `src/lib/supabase/types.ts`: manter os blocos dos dois lados (tabelas e
  colunas de cada um).
- `src/lib/migrations.test.ts`: em produção, `RESERVADOS` reserva 195–202
  para estas fases. Ao trazer a migration de número N, **tirar N de
  RESERVADOS** (o teste reprova reserva já ocupada).
- `src/lib/grupos/servicoComGrupo.test.ts`, `tabelasDoGrupo.ts`,
  `contaOculta.test.ts`: listas; manter as entradas dos dois lados.
- `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/whatsapp/repositorio.ts`:
  ler os dois lados com calma; produção adicionou roleta dos anúncios
  (`leadCriadoAgora`, `repassarPelaRoleta`), alertas por motivo
  (`podeAlertar`) e notificação de lead novo.

```bash
# 3) Verificar
npx tsc --noEmit -p .          # no Windows há 4 erros conhecidos de PixelMeta
npx vitest run                 # tudo verde (no Windows, botoesComPista e paradaSemIA podem falhar por ambiente)
npm run db:teste               # Docker: sobe banco do zero e aplica TODAS as migrations
DB_TESTE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run src/lib/grupos/isolamento.db.test.ts
npx supabase@2.121.0 stop --no-backup
```

O `next build` não roda no Windows (`PixelMeta.tsx` e `pixelMeta.ts` colidem
na caixa). Quem confere build e peso é o CI do GitHub depois do push.

```bash
# 4) Aplicar a(s) migration(s) da fase em produção (antes do deploy)
#    Endpoint: POST https://api.supabase.com/v1/projects/prhhrqyubjcafvucirri/database/query
#    Header: Authorization: Bearer $SUPABASE_PAT  (variável no .env da raiz; nunca imprimir)
#    Corpo: {"query": "<conteúdo do arquivo .sql>"}; no Windows o curl precisa de --ssl-no-revoke.
#    Resposta [] = sucesso. Depois, conferir por consulta que os objetos existem.

# 5) Publicar
for b in main claude/modernizar-plataforma-imobiliaria-2tm13q; do git merge-base --is-ancestor origin/$b HEAD && echo "$b ff ok"; done
git push origin HEAD:main HEAD:claude/modernizar-plataforma-imobiliaria-2tm13q

# 6) Conferir
curl -s https://www.nexthomeimoveis.com/api/versao     # deve mostrar o commit novo (1–3 min)
# páginas / , /corretores , /empreendimentos , /corretor/entrar em 200
# CI do commit: https://api.github.com/repos/Goes1404/next-home/actions/runs?per_page=6  (conclusion = success)
```

Se o CI falhar só em "Bundle (catraca)": alguma rota passou do teto de peso.
O log mostra `ACIMA DO TETO`; ajuste o número em `scripts/bundleTeto.mjs`
com uma nota de data e motivo, se o peso for esperado.

A fase seguinte sai da anterior: depois de publicar a 2A, faça o worktree da
`fase-2b-cota-da-ia` e repita (o merge de produção agora já traz a 2A).

## 4. Skills locais (fora do git)

Em `.claude/skills/` da pasta principal há três roteiros curtos:
`aplicar-migration-producao`, `publicar-em-producao`, `fechar-tarefa`. São
arquivos Markdown: qualquer IA pode lê-los e seguir.

## 5. Onde está cada coisa

- Desenho: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
- Planos de cada fase: `docs/superpowers/plans/2026-10-*-fase-*.md`
- Notas atômicas: `vault/10-notas/plataforma-multi-grupo.md` (entrada)
- Isolamento por grupo e guardas: `src/lib/grupos/`
- Memória das decisões: `docs/MEMORIA.md` (buscar com grep)
