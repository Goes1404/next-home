# Ingestão de material do empreendimento — PDF de apresentação e pasta do Drive

Como fotos, plantas e dados de um empreendimento saem de onde a construtora
os entrega (um PDF de apresentação, uma pasta aberta no Google Drive) e
entram no cadastro da plataforma sem passar por dezenas de cliques.

## O problema, medido no código de hoje

- `uploadFotoOuPlanta` (`src/app/corretor/(painel)/imoveis/actions.ts`) sobe
  **um arquivo por chamada** de server action. O lote existe só no cliente:
  `EditorFotos.tsx` faz um laço sequencial. Quarenta fotos = quarenta idas
  ao servidor, sem progresso, sem retomada, e a aba fechada no meio perde o
  que faltava.
- Todo insert em `midias` grava `largura: 1920, altura: 1080` **chumbados**.
  É mentira para qualquer foto que não seja 16:9, e `next/image` usa esses
  números para reservar espaço — o layout salta quando a imagem real chega.
- `blur_data_url` nunca é preenchido por nenhum caminho do código. Oito
  componentes da vitrine leem esse campo (`Galeria`, `Hero`,
  `CardEmpreendimento`, `CenaShowcase`, `Lazer`, `Sobre`, `Tipologias`,
  `Lightbox`) e todos caem em `placeholder="empty"`: flash branco em toda
  foto do site.
- Nada extrai imagem de PDF. `src/lib/leads/pdfTexto.ts` extrai **texto** de
  PDF sem dependência nenhuma, mas serve à importação de leads.
- Nenhuma integração com Drive.

Origem real do material (respondido pelo dono do produto em 24/08/2026): PDF
de apresentação da construtora **e** pasta do Google Drive aberta por link.
Vídeo continua sendo link de YouTube/Vimeo, que `src/lib/embedMidia.ts` já
resolve.

## Decisões

**Curadoria humana é obrigatória, sempre.** As três entradas (PDF, Drive,
arquivo local) convergem para a mesma tela de curadoria; nada entra em
`midias` sem passar por ela. Deck de construtora traz logo, rodapé, mapa em
baixa resolução e foto repetida. Sem filtro, isso vai para a vitrine — e a
IA do WhatsApp manda esse material como anexo para o cliente
(`resolverMidia.ts`).

**Extrair imagem de PDF sem dependência nova, até que a medição diga o
contrário.** O repositório tem 15 dependências e já provou que dá para ler
PDF com `node:zlib` puro. A alternativa (`mupdf` wasm) resolve o deck
"chapado" — aquele em que cada página é uma imagem só, típico de Canva e
InDesign — mas custa 20-40MB na função e um cold start. **Essa escolha não
se decide por argumento: decide-se medindo os PDFs reais** (fase F0). É a
régua da casa — o estilo do bot foi medido, a lista de modelos da NVIDIA foi
medida.

**Drive por API key, não por OAuth.** As pastas que chegam são abertas
("qualquer pessoa com o link"), e para essas o `files.list` do Drive v3
responde com uma API key simples. OAuth por corretor significaria tela de
consentimento, refresh token guardado no banco e app em revisão pelo Google
— trabalho e superfície de segurança que o caso real não exige. Pasta
restrita não é suportada nesta entrega: a tela diz isso e oferece o caminho
de baixar e arrastar os arquivos.

**Transferência é um arquivo por chamada, cliente orquestrando.** O teto de
função no plano Hobby é 60s (ver `docs/MEMORIA.md`). Uma pasta de 40 fotos
num único request estoura e perde tudo. Um arquivo por chamada, três em
paralelo, dá barra de progresso, retomada, e isola a falha: um arquivo ruim
não derruba os outros 39.

**Nada de preço no rascunho da IA.** A regra de negócio já proíbe a IA de
falar valores; valor sugerido errado entraria no cadastro e sairia na
vitrine com a marca da imobiliária em cima.

**Vídeo não é transferido.** MP4 de tour ou drone no Storage do Supabase
estoura cota, sai sem transcodificação e trava no 4G do cliente. A ingestão
detecta, nomeia e instrui: suba no YouTube, cole o link.

## Módulos

### `src/lib/imoveis/pdfImagens.ts` (novo)

Irmão de `pdfTexto.ts`, mesmo estilo: varredura de objetos do PDF,
`node:zlib`, zero dependência.

```ts
export type ImagemExtraida = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  largura: number;
  altura: number;
  /** Número da página em que aparece, quando determinável. */
  pagina: number | null;
  /** Proporção bate com o /MediaBox da página: provável página chapada. */
  parecePaginaInteira: boolean;
};

export type ResultadoImagensPdf = {
  imagens: ImagemExtraida[];
  /** Imagens vistas mas não lidas, por codec. Nunca some em silêncio. */
  naoSuportadas: { codec: string; quantidade: number }[];
  /** Descartadas por serem pequenas demais (ícone, logo). */
  descartadasPorTamanho: number;
};

export function extrairImagensDePdf(pdf: Buffer | Uint8Array): ResultadoImagensPdf;
```

Regras:

- `/Subtype /Image` com `/DCTDecode`: os bytes do stream **já são um JPEG**.
  Copiados crus, sem recodificar — resolução original preservada.
- `/FlateDecode` (bitmap cru), `DeviceRGB`/`DeviceGray` de 8 bits: remonta
  PNG na mão (byte de filtro 0 por linha + `deflateSync`).
- `/JPXDecode`, `/CCITTFaxDecode`, e qualquer outro: contados em
  `naoSuportadas`, não lidos. A tela mostra o número.
- Menor que 200×200 é ícone ou logo: `descartadasPorTamanho`.
- Teto de 60 imagens por PDF — deck de 80 páginas não vira 80 mídias.
- PDF acima de 25MB é recusado pelo chamador, com frase clara.

### `src/lib/imoveis/imagemDerivada.ts` (novo) — via `sharp`

```ts
export async function medirImagem(bytes: Buffer): Promise<{ largura: number; altura: number } | null>;
export async function gerarBlur(bytes: Buffer): Promise<string | null>;
export async function gerarPreview(bytes: Buffer): Promise<string>;
```

**`sharp` sobe de `devDependencies` para `dependencies`.** Ele já está no
repositório e `scripts/gerar-blur.mjs` já é a receita da casa para blur
(12px de largura, WebP q45, data URL). Uma versão anterior deste spec
propunha ler o cabeçalho do JPEG na mão e gerar o blur com canvas no
navegador, para não adicionar dependência — descobrir o `sharp` e o script
existente derruba os dois: a dependência já é do projeto, o caminho fica
único no servidor (sem CORS, sem depender do navegador do corretor), e as
três derivadas saem da mesma decodificação.

- `medirImagem`: `metadata()`. Mata o `1920x1080` chumbado.
- `gerarBlur`: `resize(12).webp({ quality: 45 })` → data URL, exatamente o
  que `gerar-blur.mjs` já produz para as fotos que estão no ar.
- `gerarPreview`: `resize(400).webp({ quality: 60 })` → data URL de ~25KB,
  usada na grade de curadoria. Sem isso, curar 60 imagens de deck
  significaria mandar 60 arquivos em resolução original para o navegador.

### `src/lib/imoveis/rascunhoDePdf.ts` (novo)

`extrairTextoDePdf` (já existe) → prompt → **`chamarLlmJson`**, a cascata
Groq→Gemini→NVIDIA→OpenAI que já atende o bot. Como o texto é extraído aqui,
o rascunho **não fica preso ao Gemini** — diferente do PDF de leads, que
manda `inlineData` e por isso só o Gemini atende. Sem texto embutido (deck
escaneado ou chapado), degrada para o `inlineData` do Gemini, o mesmo degrau
que `extrairDePdf` já faz para leads.

Campos propostos: nome, construtora, cidade, bairro, endereço, status de
obra, entrega prevista, torres, andares, unidades, tipologias (nome,
dormitórios, suítes, banheiros, vagas, metragem), itens de lazer, tagline,
descrição. **Nenhum campo de preço.**

Cada campo vem com o trecho do PDF de onde saiu, e chega à tela como
sugestão **não aplicada**. Salva só o que o corretor aceitar.

### `src/lib/imoveis/drive.ts` (novo)

```ts
export function parsearLinkDrive(url: string):
  | { tipo: "pasta" | "arquivo"; id: string }
  | { tipo: "nao_reconhecido"; motivo: string };

export async function listarPasta(id: string): Promise<ArquivoDrive[]>;
export async function baixarArquivo(id: string): Promise<{ bytes: Buffer; mime: string; nome: string }>;
```

- `parsearLinkDrive` aceita `/drive/folders/ID`, `/file/d/ID/view`, `?id=ID`,
  com ou sem `?usp=sharing`. Função pura, testada isolada.
- `listarPasta` usa `files.list` com o filtro de pasta-pai, `supportsAllDrives`
  e `includeItemsFromAllDrives` ligados (pasta de construtora costuma morar
  em Drive compartilhado). Recursão em subpasta com profundidade máxima 3.
- Nova env var `GOOGLE_API_KEY`, restrita à Drive API no console do Google.
  Só o servidor a usa. Sem a chave, a aba do Drive aparece desabilitada com
  a explicação — o caminho do PDF continua funcionando (mesmo padrão do
  `extrairDePdf` sem `GEMINI_API_KEY`).
- `video/*` não é baixado: nome listado e instrução de YouTube.

### `src/lib/imoveis/registrarMidia.ts` — caminho único de gravação

Passa a ser o único lugar que insere em `midias`. Os três fluxos passam por
ele: a tela nova de importação (PDF e Drive) e o `uploadFotoOuPlanta` que já
existe, que é reescrito para chamá-lo em vez de montar o insert sozinho —
por isso o conserto da dimensão e do blur vale também para o upload avulso
de hoje, não só para o material importado.
Grava: URL pública, tipo, alt, **largura e altura reais** (`medirImagem`),
**`blur_data_url`** (`gerarBlur`), `ordem`, e `hash_conteudo`. Se o `sharp`
falhar num arquivo (formato exótico, bytes truncados), largura/altura e blur
saem nulos e a mídia entra assim — degrada, não recusa a foto.

## Estado intermediário: onde os bytes ficam entre extrair e gravar

Curadoria acontece entre duas requisições, então os bytes precisam morar em
algum lugar. Cada origem resolve isso de um jeito diferente, e nenhum dos
dois cria tabela nova:

- **PDF**: o arquivo sobe **uma vez** para
  `empreendimentos/<id>/_importacao/<timestamp>.pdf` no Storage. A extração
  roda no servidor e devolve só os previews (data URL de ~25KB) mais o
  índice de cada imagem. Ao gravar, o servidor **re-extrai do mesmo PDF** e
  sobe apenas os índices escolhidos — a extração é determinística, então o
  índice é identidade estável. O PDF de staging é apagado ao final. Isso
  troca 60 arquivos temporários por um só.
- **Drive**: nada é baixado para curar. A grade usa o `thumbnailLink` que o
  próprio `files.list` devolve, e o download só acontece para o que o
  corretor escolheu. Pasta de 40 fotos em que ele quer 12 transfere 12.

### Curadoria — `ImportarMaterialClient.tsx`

Grade de miniaturas. Por item: tipo (foto/planta), incluir/descartar, e a
marca `parecePaginaInteira` quando o extrator suspeita de página chapada.
Escolha de capa. Botão único de gravar.

**Palpite de foto vs planta sai do `sharp`, junto com o preview**:
`stats()` devolve média por canal; planta é clara (média alta nos três) e
sem cor (canais quase iguais). Foto de fachada e de decorado não são nem uma
coisa nem outra. Pré-marca a grade; o corretor corrige o que errou. Sem
consumo de cota de IA — a cota gratuita do Gemini é de 20 chamadas por dia e
é a mesma do atendimento real (`docs/MEMORIA.md`).

## Banco — migration `0042_midias_hash.sql`

```sql
alter table midias add column hash_conteudo text;

create unique index midias_dedup_idx
  on midias (empreendimento_id, hash_conteudo)
  where hash_conteudo is not null;

grant update (hash_conteudo, largura, altura, blur_data_url) on midias to authenticated;
```

O hash (sha256 dos bytes) existe por dois motivos: a construtora manda o
deck **e** a pasta com as mesmas fotos, e sem dedup a galeria duplica; e é
ele que torna a importação **retomável** — rodar de novo não duplica nada.

O `grant` explícito segue a lição registrada em `docs/MEMORIA.md`: coluna
nova sem grant faz o update passar pela policy e afetar zero linhas, em
silêncio. Confirmar no momento da migration se `midias` tem `revoke update`
como `leads` tem; se não tiver, o grant é inócuo e fica como documentação.

## Erros

Nenhum erro engolido — é a regressão que mais se repete neste projeto.

| Situação | O que a tela diz |
|---|---|
| PDF > 25MB | Recusa com o tamanho e o limite |
| PDF sem imagem legível | Quantas foram vistas e em que codec |
| Codec não suportado | "3 imagens em formato que não sei ler" |
| Link do Drive não reconhecido | Formatos aceitos, com exemplo |
| Pasta do Drive restrita | Explica que precisa ser aberta por link; oferece arrastar arquivos |
| Arquivo do Drive falhou | Nome do arquivo + "tentar de novo" só nele |
| `GOOGLE_API_KEY` ausente | Aba desabilitada com o motivo; PDF segue funcionando |
| Cascata de IA indisponível | Imagens entram normalmente; rascunho não vem, e a tela diz isso |

## Testes

Puros, sem browser (o repositório não tem E2E autenticado — ver
`docs/MEMORIA.md`):

- `pdfImagens.test.ts` contra fixtures em `src/lib/imoveis/__fixtures__/`:
  JPEG embutido, Flate, página chapada, codec não suportado, PDF sem imagem.
- `imagemDerivada.test.ts`: medida de um JPEG e de um PNG gerados com o
  próprio `sharp`, blur que sai como `data:image/webp;base64,`, e bytes
  truncados (devolve `null`, não lança).
- `drive.test.ts`: `parsearLinkDrive` para cada forma de link e para lixo.
- `rascunhoDePdf.test.ts`: contrato do JSON, campo de preço ignorado mesmo
  quando o modelo insiste em mandar.
- Dedup por hash: mesma imagem em dois fluxos grava uma linha só.

## Fases

| Fase | Entrega |
|---|---|
| **F0** | Script descartável que mede PDFs reais: quantas imagens, que codec, que resolução, quantas prestam como foto de vitrine. Decide parser caseiro vs. `mupdf` wasm. Depende de 3-5 PDFs de construtora reais. |
| **F1** | `pdfImagens.ts` + fixtures + testes |
| **F2** | `registrarMidia` compartilhado: `sharp` em `dependencies`, dimensão real, blur, hash, migration 0042 |
| **F3** | Tela Importar + curadoria + gravação (caminho PDF completo) |
| **F4** | Drive: parser de link, listagem, transferência item a item |
| **F5** | Rascunho do cadastro pela cascata, campo a campo |
| **F6** | Vídeo: detecta na pasta, nomeia, instrui YouTube |

F0 é a única fase bloqueada por material externo. F1 e F2 começam sem ela —
e a F2 conserta, sozinha, duas coisas que hoje estão erradas em toda foto do
site.

## Fora de escopo (YAGNI)

- OAuth do Google e pasta restrita do Drive.
- Transcodificação ou hospedagem de vídeo.
- OCR de planta escaneada.
- Classificação de imagem por IA de visão (a heurística no cliente basta, e
  a cota do Gemini é do atendimento).
- Reordenar a galeria arrastando — a capa já é escolhível e o resto segue a
  ordem de entrada.
