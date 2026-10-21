# Marca de cada imobiliária dentro do CRM (21/10/2026)

Pedido do dono: o cliente que entra pelo CRM (`astroimob.vercel.app`) não
pode ver "Next Home" nem `nexthomeimoveis.com` depois do login. A Next Home
(grupo 1) continua EXATAMENTE como está.

Contexto que já existe (ler antes):
- `src/lib/enderecosDoPainel.ts` — o endereço só do CRM (`astroimob.vercel.app`).
- `src/lib/sites/marca.ts` (`MarcaDoSite`, fase 3) e `src/lib/whatsapp/casa.ts` /
  `casaDoGrupo.ts` (`lerCasaDoGrupo`, fase 4: nome da casa por grupo).
- `src/app/corretor/(painel)/admin/marca/page.tsx` — tela de marca que já existe:
  descubra o que ela faz e reaproveite.
- `src/lib/site.ts` (`site.nome`, `site.url`, `site.wordmark`): a marca da
  instalação (Next Home). Hoje ~50 arquivos de painel, crons e mensagens a leem fixa.
- `docs/HANDOFF-MULTI-GRUPO.md` — estado geral e regras.

## Regras

1. **Grupo 1 não muda nada**: mesmas palavras, mesmos links
   (`nexthomeimoveis.com`), mesma aparência. Teste que trava isso.
2. Outro grupo: nome = `grupos.ia_nome_da_casa` se preenchido, senão
   `grupos.nome`; logo = `grupos.logo_url` (nova) se houver, senão o nome
   escrito.
3. **Endereço do painel por grupo**: grupo 1 → `site.url`; outros →
   `PAINEL_URL` (variável; padrão `https://astroimob.vercel.app`). Toda URL
   que leva o CORRETOR ao painel (avisos no WhatsApp, notificação, resumo
   do dia, convite por e-mail, recuperação de senha, links do Live Chat)
   usa essa função, nunca `site.url` direto.
4. **Links para o CLIENTE do grupo** (seleção de imóveis, documentos,
   agenda .ics, links do cliente): grupo 1 → como hoje; outro grupo → o
   endereço principal do site dele em `enderecos_do_site` (fase 3) se
   existir; senão o endereço do painel. Nesse caso, essas rotas públicas de
   token têm de abrir no endereço do painel: hoje o `proxy.ts` manda toda
   página "do site" para `/corretor` nos endereços só do painel — acrescente
   as rotas de token que o cliente recebe à lista que fica de fora desse
   redirecionamento (descubra quais são lendo `linksAcoes.ts`,
   `documentacaoAcoes.ts`, `previaDoLink.ts` e as pastas de `src/app`).
5. **Onde a marca aparece no painel**: cabeçalho/menu do painel, título das
   abas (`metadata` do layout do painel: hoje herda o template com o nome
   da Next Home), manifest/ícone se for simples (se não for, deixe e anote).
6. **Mensagens automáticas ao corretor** com o nome da casa: título da
   notificação no celular (`leadNovo.ts`, `avisoAoCorretor.ts`), texto da
   roleta `{imobiliaria}` (`roletaDosAnuncios.ts`), resumo do dia, relatório
   das avaliações, avisos de queda do número, lembretes. O nome sai do
   grupo do corretor (com cache simples por requisição; nada de consulta
   por item dentro de laço).
7. **Logo**: migration `supabase/migrations/0208_logo_do_grupo.sql` —
   `grupos.logo_url text` (sem grant de update para a sessão; quem grava é
   action com chave de serviço). Upload: no painel da plataforma
   (`/plataforma/grupos/[id]`, guarda `exigirAdminDaPlataformaNaAcao`) e na
   tela de marca do ADM do grupo (guarda de gestor, só o próprio grupo).
   Arquivo PNG/JPEG/WebP/SVG? — **sem SVG** (risco de script); até 1 MB;
   vai para o bucket público `empreendimentos` em `grupos/<grupo_id>/logo-<hash>.<ext>`,
   como as outras mídias. Padrão de migration: `0207_cobranca_manual.sql`
   (`begin; set local lock_timeout = '5s'; … commit;`).
8. **Não mexer** em: site público (fase 3 já resolve por endereço), prompt
   da IA (fase 4 já resolve), `dadosEstruturados.ts`, `sitemap`, `robots`.

## Verificação

- Inventário: liste em `.relatorio-marca.md` cada uso de `site.nome` /
  `site.url` / `site.wordmark` fora do site público e o que fez com cada um
  (trocou / deixou de propósito, com motivo).
- Guarda nova (teste que lê código): arquivos do painel, crons e
  `src/lib/crm`, `src/lib/notificacoes`, `src/lib/whatsapp` não podem usar
  `site.url` para montar link do painel — só a função nova. Exceções
  declaradas com motivo.
- `npx tsc --noEmit -p .` (4 erros conhecidos de PixelMeta no Windows),
  `npx vitest run --exclude ".claude/**"`, `npm run db:teste` + os
  `*.db.test.ts` com `DB_TESTE_URL`, `npx supabase@2.121.0 stop --no-backup`.
  `next build` não roda no Windows.
- Vault: nota `vault/10-notas/marca-do-grupo-no-crm.md` (frontmatter como em
  `roleta-dos-anuncios.md`, tags do vocabulário fechado) ligada ao
  `vault/20-mocs/MOC — CRM e Painel.md`; seção curta no FIM de
  `docs/MEMORIA.md` (append, nunca reescrever); atualizar
  `docs/HANDOFF-MULTI-GRUPO.md` ("Onde estamos" e "Próximos passos").
