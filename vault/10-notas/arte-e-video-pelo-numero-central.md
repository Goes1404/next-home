---
title: Arte e vídeo pelo número central
aliases: [gerar_arte, criar_video, resposta com arquivo, artePeloCentral, videoPeloCentral, entregaPeloCentral, enviarRespostaDoCentral]
tags: [whatsapp, midia, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/tratadores/estudio.ts
  - src/lib/estudio/artePeloCentral.ts
  - src/lib/video/videoPeloCentral.ts
  - src/lib/video/entregaPeloCentral.ts
  - src/lib/central/executar.ts
  - src/lib/central/conversa.ts
  - src/lib/central/webhook.ts
  - src/lib/central/grupo.ts
  - src/lib/whatsapp/provider.ts
  - src/app/api/cron/followups/route.ts
fonte: onda 3 do número central, Frente M (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: gerar_arte (16) e criar_video (32) são AÇÃO com "sim" (gastam cota; sem desfazer). A arte é a geração do Estúdio sem sessão (artePeloCentral espelha /api/imagens/gerar, nas mesmas guardas) e volta como ARQUIVO; se passar de 25 s, o "sim" responde "te mando em instantes" e a mesma geração é entregue em after(). O vídeo entra na fila video_jobs marcado origem central; como o worker roda no GitHub Actions sem as chaves da Evolution, quem manda o vídeo pronto é o tique dos follow-ups (5 min). A conversa ganhou resposta com arquivo genérica (RespostaDoCentral.arquivos/depois; só URL, marca "[imagem]" no histórico e no registro).
---
# Arte e vídeo pelo número central

Spec 3.5 (16: "faz um post do Vitta pro Instagram"), 3.7 (32: "faz um vídeo
do Vitta pro Reels") e 4.5 ("arte do Estúdio volta como arquivo, para o
corretor encaminhar"). Onda 3; `ONDA_ATUAL` segue 0.

## Resposta com arquivo (genérica)

- `executar.ts`: `ResultadoDaAcao.arquivos` (`{ tipo: "imagem" | "video", url }`)
  e `ResultadoDaAcao.depois` (promessa que entrega `{ texto, arquivos }`
  depois da resposta). Consulta também pode devolver `arquivos`: o executor
  tira do que vai ao cérebro (que só vê `arquivosQueVaoJunto: n`) e guarda em
  `arquivosColetados` — é o caminho para fotos/planta do imóvel depois.
  `arquivosValidos` só deixa passar URL http (nada de `data:`/base64).
- `conversa.ts`: `RespostaDoCentral.arquivos` e `.depois` (`{ corretorId,
  entrega }`). `responderNoCentral` continua devolvendo só os textos;
  `responderNoCentralComArquivos` é o que o webhook usa. No histórico e no
  registro o arquivo vira **"[imagem]"/"[vídeo]"**, nunca a URL.
- `webhook.ts` (`enviarRespostaDoCentral`): textos primeiro, depois cada
  arquivo por `enviarMidiaWhatsapp` (mídia nativa, sem legenda). Cada
  `depois` vai para `after()`: manda o que a promessa entregar e anota no
  histórico com `registrarAvisoNoHistorico` (o mesmo dos avisos, 4.7).
- `grupo.ts`: o arquivo segue a MESMA regra do texto (`respostaSoNoPrivado`);
  no grupo sai por `enviarMidiaWhatsappParaGrupo` (novo em `provider.ts`, o
  JID não passa pelo normalizador de telefone). `depois` não nasce no grupo:
  só sai de um "sim", que é sempre no privado.
- Só URL, por decisão: o provedor manda mídia por URL; quem tiver só o
  buffer sobe ao Storage antes. `documento` (PDF) fica de fora até o
  provedor ganhar o tipo.

## Arte (16)

- `preparar` (não gasta): imóvel pelo texto com `acharImovel` (Frente F,
  catálogo do grupo; ambíguo = pergunta), formato pela régua do Estúdio
  (story/reels → retrato; capa → paisagem; resto → post quadrado) e
  `conferirArtePeloCentral` (suspensão, motor configurado, teto diário 20 do
  corretor, limite de artes do plano). Recusa vira resposta, não proposta.
  Resumo: "Gerar com IA um post do X … (consome cota de IA da imobiliária;
  arte gerada não tem como desfazer)".
- "sim": `gerarArtePeloCentral` = a rota `/api/imagens/gerar` sem sessão:
  confere de novo, relê o imóvel COM o grupo, `traduzirPedido` com os fatos
  da ficha, `gerarImagem` (grava `registrarConsumoDaIa`, `arte_imagem`,
  quem pediu paga), carimbo da ressalva antes do upload, mesmo caminho
  `corretores/<id>/criacoes/<hash>.png`, `registrarImagem` com o imóvel (a
  linha que o gatilho da 0214 conta no limite do mês). Ressalva que falhou =
  aviso no texto ("não publique sem ele").
- **Síncrono × assíncrono**: o "sim" espera 25 s. Pronto antes → texto +
  arquivo. Passou → "Estou gerando o post do X; te mando aqui em instantes"
  e a MESMA geração (já em curso, já paga) segue em `after()`. Atenção: o
  `after` vive dentro do teto da função (60 s), por isso a imagem pelo
  central tem 40 s de teto (45 s na tela); `low` mediu 14,5 s.
- **Orquestração espelhada, não extraída**: a rota é presa por guardas que
  leem o código dela (`receitas.test.ts`, `limitesNoPontoDeGeracao.test.ts`,
  `quandoAIaResponde.test.ts`). `artePeloCentral.ts` entrou nas duas
  últimas (limite antes do tradutor e do gerador; suspensão).

## Vídeo (32)

- `preparar`: imóvel, `conferirVideoPeloCentral` (suspensão, limite de
  vídeos do plano, saldo do corretor); resumo diz quantos restam e que não
  tem desfazer. Canal padrão Reels/Story (a ferramenta só declara o imóvel);
  objetivo pela fase do imóvel.
- "sim": `criarVideoPeloCentral` = `criarVideo` da tela sem sessão (fonte
  catálogo, sem foto anexada, então sem IA de visão), `enfileirarVideo` com
  `briefing.origem = "central"`, `acionarRender()`.
- **Volta pelo tique, não pelo worker** (armadilha): o worker
  (`scripts/video/worker.ts`) roda no GitHub Actions só com as chaves do
  Supabase; mandar dali exigiria pôr as da Evolution no workflow. Então o
  tique dos follow-ups (pg_cron, 5 min) chama `entregarVideosPeloCentral`:
  jobs `pronto`/`erro` concluídos há < 24 h com `origem central` e sem
  `briefing.centralEntregueEm`; canal = `destinoPeloCentral` (Frente J);
  texto + vídeo (se a mídia falhar, o link); marca gravada DEPOIS do envio
  (pior caso: chegar duas vezes). Onda < 3: não lê nada.

## Guardas

`servicoComGrupo.test.ts` (4 entradas no MAPA), `limitesNoPontoDeGeracao`,
`quandoAIaResponde`, `consumoCompleto` (a arte grava pelo `gerarImagem`).
Testes: `tratadores/estudio.test.ts`, `estudio/artePeloCentral.test.ts`
(fetch falso na OpenAI, consumo gravado), `video/videoPeloCentral.test.ts`,
`central/respostaComArquivo.test.ts` (fetch falso na Evolution, grupo).

Ver também [[numero-central-em-grupos-da-equipe]],
[[avisos-espontaneos-pelo-numero-central]],
[[crm-pelo-whatsapp-numero-central-com-ia]].
