# Importar do site da construtora (design, 25/09/2026)

Pedido: *"colar a URL do site da construtora e extrair as informações — fotos,
vídeos, tours 3D — para cadastrar imóveis novos e editar os existentes mais
rápido"*.

## O que já existe e não será reescrito

O importador de material (`/corretor/imoveis/[slug]/importar`) já faz 80% do
trabalho para duas origens, PDF e Google Drive:

| peça | onde | reaproveitamento |
|---|---|---|
| Rascunho do cadastro por IA, campo a campo, com o valor atual ao lado e **preço filtrado no código** | `rascunhoDePdf.ts` (`interpretarRascunho`, tetos de plausibilidade) + `RascunhoCadastro.tsx` + `aplicarRascunhoNoCadastro` | a leitura por IA recebe TEXTO; hoje o texto vem do PDF, amanhã vem da página |
| Grade de curadoria (marcar o que entra) | `GradeCuradoria.tsx` | a mesma grade, com a miniatura vindo da URL da construtora |
| Caminho único de mídia: medida, blur, dedup por sha256 | `registrarMidia.ts` | reimportar a mesma página não duplica foto |
| Tipologia a partir da imagem da planta (visão) | `gerarTipologiaDaPlanta` / `lerPlanta.ts` | planta achada no site vira planta cadastrada |
| Validação de link de vídeo e tour 360 | `embedMidia.ts` + action de mídia externa | YouTube, Vimeo, Matterport, Kuula |

**Decisão:** o site vira a TERCEIRA ORIGEM do importador ("PDF · Drive ·
Site"), não uma tela nova. Duas telas para o mesmo dado divergem (a lição do
`turnoDeAtendimento`).

## O que a medição mostrou (25/09)

Seis construtoras, páginas reais de empreendimento, baixadas sem navegador:

| site | HTML traz o conteúdo? | imagens | texto útil | vídeo/tour |
|---|---|---|---|---|
| Cyrela (Escape Brooklin) | sim (Drupal) | 108, **1500×1500 px** | 10 mil caracteres | Matterport |
| EZTEC | sim (WordPress) | 164 | 6,7 mil | YouTube |
| Plano&Plano | sim | 77 | 7,9 mil | YouTube |
| Even | sim (Next.js) | 1.260 (tamanhos repetidos) | 9 mil | YouTube |
| MRV, Vivaz, Tenda | **não**: página montada por JavaScript | 0–7 | quase nada | — |
| P4 Engenharia | sim, com cabeçalhos de navegador (a primeira sonda levou 406 com um `User-Agent` curto) | 60+ | 7,6 mil | sim |

Leituras que decidem o desenho:

1. **A maioria entrega tudo no HTML.** Baixar a página e ler resolve sem
   navegador — rápido, barato e cabe nos 60 s da função.
2. **Um terço é montado por JavaScript** e precisa de navegador de verdade.
   Isso é caro (Chromium na função) e fica para uma fase condicional.
3. **Alguns bloqueiam robô.** Aí a saída honesta é dizer isso e oferecer PDF
   ou Drive, não insistir.
4. **As fotos do site são grandes** (1500 px na Cyrela), contra os originais
   de 320 px de vários imóveis do nosso catálogo. Só isso já melhora a vitrine.
5. **Texto alternativo e nome do arquivo classificam** (`"Planta Tipo 80m² -
   1 suíte"`, `04_CYRFL_PH_98m2_TIPO_A.jpg`, `Fachada_B.jpg`). Dá para
   pré-marcar planta × foto sem IA.
6. **O volume bruto é ruído**: a Even repete cada foto em vários tamanhos
   (`srcset`), mais logos e ícones. Sem filtro, a grade viria com 1.260 itens.

## Fluxo para o corretor

**Imóvel existente:** Imóveis → imóvel → Importar material → aba **Site** →
cola o link → em ~10 s aparecem três blocos:

1. **Dados do cadastro** propostos, campo a campo, com o valor atual ao lado
   (o mesmo componente do PDF). Nada é gravado sem marcar.
2. **Fotos e plantas** numa grade, com as plantas já separadas e pré-marcadas
   como planta. As que já estão no imóvel aparecem como "já cadastrada".
3. **Vídeos e tours 3D** achados na página, cada um com prévia e caixa de
   marcar.

"Trazer os marcados" baixa só o que foi escolhido.

**Imóvel novo:** em Imóveis → Novo, um campo "Tem o site da construtora?
Cole o link". Ele preenche nome, cidade e construtora e oferece os bairros
encontrados para escolher (a mesma escolha da fila de candidatos, porque o
site costuma trazer mais de um). O imóvel nasce **despublicado**, como hoje, e
a tela segue direto para o importador com o link já colado.

## Arquitetura

```
URL colada
  └─ buscarPagina(url)            servidor, fetch com trava anti-SSRF
       └─ lerPaginaDaConstrutora(html, url)   PURO, testável com HTML salvo
            ├─ texto limpo        → montarRascunho(texto)  (IA, já existe)
            ├─ dadosEstruturados  JSON-LD, og:, geo       → dicas sem IA
            ├─ imagens[]          url absoluta, alt, maior do srcset, pista planta/foto
            └─ midiasExternas[]   YouTube, Vimeo, Matterport, Kuula → embedMidia
```

- **`lerPaginaDaConstrutora` é função pura** (HTML + URL → estrutura). É onde
  mora quase toda a regra, e se testa com HTML real salvo em fixture (Cyrela,
  EZTEC, Plano&Plano, Even), sem rede. Lê `src`, `data-src`, `data-lazy`,
  `srcset` (fica o maior), `background-image` inline, `og:image`, JSON-LD e
  iframes.
- **Filtro de imagem, sem IA:** descarta SVG, ícones e logos pelo nome e pela
  dimensão declarada, junta tamanhos da mesma foto e põe teto de 60 na grade.
  A dimensão real só é conhecida quando baixa; a prévia usa a própria URL.
- **`montarRascunhoDePdf` vira `montarRascunho(texto)`**, e o PDF passa a ser
  só um dos fornecedores de texto. Tetos de plausibilidade e filtro de preço
  continuam valendo, porque página de construtora também abre com o
  portfólio dela ("+27 mil lares").
- **JSON-LD e `og:` entram como DICA no prompt**, nunca direto no cadastro:
  `og:region` da Cyrela diz "Brooklin", mas o campo que a busca e o mapa usam
  é UM bairro, escolhido pelo corretor.
- **Nenhuma tabela nova para o fluxo.** A análise roda na hora e a curadoria
  só precisa das URLs de volta. Diferente do PDF, não há arquivo para guardar
  entre as duas requisições.

## Segurança: buscar URL colada é porta de SSRF

O servidor vai buscar um endereço que alguém digitou. Sem trava, `http://169.254.169.254/`
ou `http://localhost` viram leitura da rede interna da Vercel. Regras, todas
com teste:

- só `https`, e porta padrão;
- resolver o DNS e **recusar IP privado, loopback, link-local e metadata**,
  inclusive depois de cada redirecionamento (no máximo 3);
- teto de 5 MB para o HTML, 15 MB por imagem, 10 s de tempo por pedido;
- só baixar imagem cujo `content-type` é imagem;
- a ação exige corretor logado (`getCorretorLogado`), e o texto da página
  entra no prompt como DADO, nunca como instrução.

## Direitos e regras de negócio

- **Foto de construtora é dela.** Importar faz sentido para imóvel que a Next
  Home representa, a mesma régua da fila de candidatos (0078), que decidiu não
  copiar foto de imóvel que ninguém da casa vende. A tela diz isso em uma linha
  antes de "Trazer os marcados".
- **Preço não entra**, filtrado no código (regra já existente).
- **Vídeo hospedado no próprio site (`.mp4`) não é baixado**: estoura o teto
  de 50 MB do Storage (plano free) e a vitrine só toca YouTube, Vimeo e tour.
  Aparece como "vídeo no site da construtora, suba no YouTube para usar".

## Fases

| fase | entrega | pronto quando |
|---|---|---|
| **F0 — medir com os sites que vocês usam** | script `scripts/sondarSite.ts` que roda o leitor sobre 10–15 URLs reais das construtoras de Barueri/Alphaville e mede: conteúdo no HTML ou JS, fotos úteis, plantas, vídeos, tours, bloqueio | a tabela diz quantos % funcionam só com busca estática |
| **F1 — leitor + busca segura** | `buscarPagina` (anti-SSRF) e `lerPaginaDaConstrutora` (puro), com fixtures reais | testes de fixture e de SSRF passando; guarda provocada |
| **F2 — aba Site no importador** | texto → rascunho, grade com plantas pré-marcadas, vídeos e tours marcáveis, download só dos marcados via `registrarMidia` | um imóvel real importado de ponta a ponta em produção |
| **F3 — imóvel novo pelo link** | campo no formulário de novo imóvel, escolha de bairro, redireciona ao importador | cadastro novo em menos de 2 minutos, contado |
| **F4 — lembrar a fonte** | coluna `site_construtora` (migration + grant de update) e botão "Buscar novidades no site", que mostra só o que mudou (fotos novas, campo diferente) | reabrir um imóvel já importado não repete nada |
| **F5 — sites montados por JavaScript** (condicional) | navegador sem tela na função (`@sparticuz/chromium`) ou no worker; só se a F0 mostrar que vale | medido: tempo e custo dentro de 60 s |

A F5 é condicional de propósito: Chromium na função pesa ~60 MB e segundos de
partida a frio, e se as construtoras com quem vocês trabalham entregam HTML,
esse custo não compra nada.

## Guardas planejadas (regressões que falhariam caladas)

- anti-SSRF: tabela de endereços proibidos, cada um reprovando;
- nenhum `insert` em `midias` fora de `registrarMidia` (regra já existente);
- rascunho do site nunca carrega preço;
- o leitor com cada fixture real acha as plantas e os tours que a página tem.

## Perguntas em aberto

1. **Quais construtoras**, e 10–15 links de páginas de empreendimento que
   vocês de fato usam: é com eles que a F0 decide se a F5 existe.
2. **Direito de uso**: vocês importariam só imóveis que a Next Home
   representa? O plano parte desse princípio.

## Estado em 25/09/2026

Entregues **F1, F2 e F3** (F0 medida com os sites acima, sem os links da casa):

- `src/lib/imoveis/site/enderecoPublico.ts` + `buscarSeguro.ts`: busca com a
  trava anti-SSRF (IP conferido na conexão e a cada redirecionamento).
  Conferido ao vivo: `169.254.169.254`, `localhost` e `127.0.0.1.nip.io`
  recusados.
- `src/lib/imoveis/site/lerPagina.ts`: leitor puro, testado com as páginas
  reais de Cyrela, EZTEC, Plano&Plano e Even (`__fixtures__`).
- Aba **Site da construtora** no importador (`OrigemSite.tsx`), primeira e
  padrão. Planta trazida vira tipologia; vídeo e tour entram pelo mesmo
  `adicionarMidiaExterna` do editor.
- Imóvel novo: "Preencher pelo site" no formulário; depois de criar, o
  importador abre com `?site=` e lê a página sozinho.

**F4 entregue no mesmo dia** (migration `0113`): `empreendimentos.site_construtora`
e `midias.origem_url` (a chave da foto no site). "Buscar novidades" relê o
link guardado; o que já foi trazido nasce escondido e desmarcado. As duas
colunas são lidas e gravadas à parte, com o erro engolido: o código não cai
enquanto a migration não estiver aplicada.

Pendente: **F5** (sites montados por JavaScript). Não exercitado com login: o fluxo completo
no painel de produção.

