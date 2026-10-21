# "Meu site" — o que cada imobiliária edita no próprio site (21/10/2026)

Pedido do dono. Fase 3 (site por endereço) e a marca do grupo no CRM
(0208, `grupos.logo_url`) já estão no ar. Leia antes:
`docs/HANDOFF-MULTI-GRUPO.md`, `src/lib/sites/marca.ts` (`MarcaDoSite`, como
o site de cada grupo é montado hoje), `src/app/s/` (o segmento do site por
endereço), `docs/SITES-POR-ENDERECO.md`, e as telas existentes do ADM em
`src/app/corretor/(painel)/admin/` (há uma tela `marca`).

## Regras

1. **A Next Home (grupo 1) não muda nada** no site dela: os dados da casa
   continuam vindo de `site.ts`/`NEXT_PUBLIC_MARCA`. A tela "Meu site" para o
   grupo 1 pode existir, mas o site dela só passa a ler os campos novos se o
   dono decidir depois — nesta etapa, **não**. Teste que trava isso.
2. Para os OUTROS grupos, o site passa a usar o que o ADM editou; campo vazio
   cai no comportamento de hoje (nada quebra se ninguém preencher).

## O que o ADM do grupo edita (tela "Meu site")

Menu Administração → "Meu site" (`src/app/corretor/(painel)/admin/site/`),
guarda de gestor do próprio grupo (`exigirGestorNaPagina`/`NaAcao`).

- **Identidade:** logo (a mesma de 0208, reaproveitar o upload que existe) e
  **cor principal** (hex, validada; o site aplica como variável de cor do
  acento — veja como a cor do acento é definida hoje no CSS do site e só
  sobrescreva a variável no segmento do grupo, como o login faz com
  `--color-acento`). Conferir contraste mínimo do texto sobre a cor
  (escolha um texto branco ou escuro automaticamente pela luminância).
- **Topo da home:** foto de capa (upload, JPG/PNG/WebP até 5 MB, para o
  bucket público `empreendimentos` em `grupos/<id>/site/…`, como a logo),
  título e frase de abertura (com limite de caracteres).
- **Sobre a imobiliária:** texto (até ~1.200 caracteres).
- **Contatos:** WhatsApp principal, e-mail, endereço (logradouro, bairro,
  cidade, UF, CEP), Instagram, Facebook, CRECI (já existe `grupos.creci` /
  `creci_tipo` — reaproveitar). O botão de WhatsApp do site do grupo continua
  passando pelo `/wa` (sorteio entre os corretores do grupo); o WhatsApp
  principal é o do rodapé/contato.
- **Destaques:** quais imóveis aparecem em destaque e em que ordem — já
  existe a tela "Ordem no site" (`/corretor/imoveis/ordem`); só garantir que
  ela vale por grupo e linkar a partir de "Meu site" (não duplicar).
- **Prévia:** botão "Ver meu site" que abre o endereço principal do grupo
  (de `enderecos_do_site`); sem endereço, dizer que o site precisa de um
  endereço e que a plataforma liga isso.

## Banco — `supabase/migrations/0209_site_do_grupo.sql`

Padrão de `0207`/`0208` (`begin; set local lock_timeout='5s'; … commit;`).
Colunas novas em `grupos` (ou uma tabela `sites_do_grupo` 1:1 com
`grupo_id` — escolha a mais simples, justificando): `site_cor`, `site_capa_url`,
`site_titulo`, `site_frase`, `site_sobre`, `site_whatsapp`, `site_email`,
`site_endereco jsonb`, `site_instagram`, `site_facebook`. CHECKs de tamanho e
formato (URL https, hex). Sem grant de update para a sessão: grava por
action com chave de serviço depois da guarda; evento em `admin_eventos`
(estender o CHECK de `acao` repetindo a lista inteira da última definição,
como a 0208). Leitura pública do site: pelo caminho que `MarcaDoSite` já usa
(servidor), nunca pela chave anon.

## Plataforma: ligar o endereço do site ao grupo

Em `/plataforma/grupos/[id]`: seção "Site" listando os endereços do grupo
(`enderecos_do_site`), com adicionar (host, tipo `proprio`/`gratuito` conforme
o CHECK da 0201, principal sim/não) e remover. Guarda
`exigirAdminDaPlataformaNaAcao`, chave de serviço, evento. Validar host
(minúsculas, sem esquema/caminho, nome de DNS válido) e recusar host já usado
por outro grupo (a PK já recusa; traduzir o erro). Texto de ajuda: o host
também precisa ser adicionado em Vercel → Settings → Domains.

## Site do grupo usando os dados

`MarcaDoSite` (e quem monta cabeçalho, home, rodapé, contato, sobre) lê os
campos novos para grupos ≠ 1: logo no cabeçalho, cor, capa/título/frase no
topo da home, "Sobre", contatos no rodapé e na página de contato, JSON-LD
com os dados do grupo. Vazio → comportamento atual.

## Verificação

tsc (4 erros conhecidos de PixelMeta), `npx vitest run --exclude ".claude/**"`,
`npm run db:teste` + `*.db.test.ts` com `DB_TESTE_URL`, `supabase stop`.
Testes: grupo 1 inalterado (marca e páginas), grupo 2 com e sem campos
preenchidos, validações (cor, URL, host), guarda (corretor comum não edita;
gestor não edita outro grupo; só plataforma liga endereço). Guardas do
projeto atendidas (`servicoComGrupo`, `contaOculta`, `botoesComPista`,
`naoCortaTexto`, `tabelasSeguras`). Vault (nota ligada ao MOC Front Público),
fim da `docs/MEMORIA.md` (append) e `docs/HANDOFF-MULTI-GRUPO.md`.
