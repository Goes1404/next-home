# Roadmap — vídeo de imóvel

> Versão navegável, com tabelas formatadas:
> https://claude.ai/code/artifact/c3074fa6-9385-4a22-982d-bce7fbe1d930
>
> Este arquivo é a cópia versionada. Medições de 03/09/2026, câmbio
> US$ 1 = R$ 5,139.

O roadmap original construía a metade cara primeiro. Esta versão inverte a
ordem, corta duas peças de infraestrutura que este projeto não precisa, e
registra a descoberta que mais muda o plano: **o gerador de vídeo não depende
da plataforma** — dá para vendê-lo antes de existir multi-inquilinação,
importação de site ou WhatsApp por cliente.

## Onde estamos

A arte estática já está no ar (03/09): o briefing sai da ficha real, a IA
escreve dentro de uma régua de publicidade imobiliária, e o compositor põe
logo, copy e ressalva no tamanho do canal. Custa R$ 0,03 por peça.

Vídeo é o próximo bloco de *criação de conteúdo* — e, por decisão de produto,
vem **antes** da migração para a API oficial da Meta e antes da reconstrução
multi-inquilino.

## O achado: um vídeo do Veo custa 600 imagens

O plano original pedia 4 clipes de 8 s gerados por IA. Ao lado, o custo com as
fotos reais que já estão no catálogo — média de 12,3 por imóvel, e 24 dos 25
publicados com quatro ou mais.

| Caminho | Imagem | US$ | R$ |
|---|---|---:|---:|
| Foto real em movimento | Do catálogo | 0,0004 | **0,002** |
| Veo Fast 720p, vídeo inteiro | Gerada por IA | 3,20 | 16,44 |
| Veo Standard, vídeo inteiro | Gerada por IA | 12,80 | 65,78 |

Veo a US$ 0,40/s (Standard) e US$ 0,10/s (Fast 720p), preço da Gemini API. O
caminho de foto real **não usa IA de vídeo**: o FFmpeg monta as fotos que já
existem, e a única chamada de API é a que escreve a legenda. Sem locução e sem
trilha — as duas decisões de produto — não sobra mais nada para pagar.

**Por que isso decide o produto.** Numa plataforma para imobiliária de pequeno
e médio porte, R$ 16,44 por clique não cabe em cota incluída. O Veo deixa de
ser o motor e vira upgrade pago. E resolve junto o problema de honestidade:
vídeo gerado desenha um prédio que não é o prédio, e o cliente confere isso na
visita.

### Alternativas mais baratas (levantadas em 03/09)

| Caminho | Custo | Observação |
|---|---:|---|
| Veo Standard, vídeo inteiro | R$ 65,78 | — |
| Veo Fast, vídeo inteiro | R$ 16,44 | — |
| Veo Fast, só o plano-herói de 6 s | R$ 3,08 | resto de foto real |
| Hailuo-02 Standard, plano-herói de 6 s | R$ 1,39 | ~4 min de processamento, teto de 6 s |
| Só foto real com movimento | ~R$ 0,00 | — |

Hailuo-02 Standard 768p a US$ 0,045/s (fonte: fal.ai). Duas alavancas
independentes: **gerar menos** (um plano-herói em vez do vídeo inteiro) e
**trocar de modelo**. Juntas, 12x mais barato.

**Não medido ainda:** a qualidade do Hailuo, e a latência real do Veo. O preço
foi verificado na fonte; a imagem não. Teste pendente por falta de saldo na
conta fal.ai.

## Provado: o caminho barato já foi exercitado

Um vídeo de 17 s, 1080×1920, montado com cinco fotos reais do *Apartamento ao
lado do Shopping*: movimento de câmera por plano, crossfade, legenda queimada,
logo e ressalva. Nenhuma IA de vídeo envolvida.

| Etapa | Tempo |
|---|---:|
| Cinco planos com movimento | 74,9 s |
| Costura, legenda e marca | 12,0 s |
| **Total** | **86,9 s** |

Medido em 4 CPUs. Confirma que o render **não cabe nos 60 s da Vercel**, e que
o custo real é máquina, não API — despesa fixa mensal, que não escala com o
número de vídeos. Os 74,9 s são cinco planos independentes: paralelizáveis.

**Duas restrições que só apareceram fazendo.** As fotos do catálogo são
1000×512, panorâmicas demais para 9:16 — a foto nítida ocupa uma faixa e o
resto do quadro é preenchido com uma cópia borrada dela. E o título vazou pela
direita na primeira montagem: o mesmo defeito da arte estática, onde limite de
caracteres não é limite de largura.

## A virada: o vídeo não depende da plataforma

Como o próprio usuário sobe as fotos, o gerador não precisa do catálogo dele.
Precisa de fotos, bairro, tipologia e estágio da obra — quatro campos.

- Não precisa de **multi-inquilinação** para vender o primeiro vídeo.
- Não precisa de **importação do site** do cliente, que era a peça mais frágil.
- Não precisa de **WhatsApp por cliente** nem da API oficial da Meta.

## Quatro premissas do plano original que não valem aqui

**Corta — Redis + BullMQ + Workers.** O projeto já tem fila que sobrevive a
corrida entre três chamadores: tabela no Postgres, trava por instância,
pg_cron e auto-encadeamento. Redis seria um segundo serviço com estado para
operar antes do primeiro cliente pagante.

**Corta — tabela `users` com saldo.** `corretores` já existe. O saldo segue o
padrão de `imagens_geradas`: contagem no banco, teto conferido antes de
gastar, escrita só pela service key.

**Corta — Vertex AI + Service Account.** O Veo está na Gemini API, com a chave
que o projeto já tem.

**Ajusta — onde o FFmpeg roda.** A única infraestrutura genuinamente nova. A
Vercel está no Hobby (60 s por função, sem binário de FFmpeg).

## As fases, cada uma com um portão

Quatro recursos deste projeto subiram completos e produziram zero linhas —
relatório semanal, Meta Ads F1, lembrete de visita, o 👍/👎 do Live Chat. Cada
fase só libera a seguinte se o portão passar.

### F0 — Provar que vídeo move o ponteiro · uma tarde · R$ 0

- Montar **um** vídeo à mão para o melhor imóvel. Nada de código.
- Disparar numa campanha real, contra a lista que hoje converte a **1,1%**
  (88 entregues, 1 resposta).
- Medir resposta e clique no link de indicação (`cliques_whatsapp`).

**Portão:** a taxa de resposta com vídeo bate a de sem vídeo, com margem
visível. Se empatar, o gargalo é a lista ou a mensagem de abertura.

### F1 — O motor: foto real com movimento de produtora · ~R$ 0,002 por vídeo

Sem locução e sem trilha, "qualidade de produtora" se decide no motion design.

- **Gramática de câmera por tipo de plano**, derivada do `alt` da foto:
  fachada pede *tilt* revelando altura, living pede aproximação, lazer pede
  *pan* lateral, implantação pede afastamento. Toda curva com aceleração —
  movimento linear é o que denuncia slideshow.
- **Receitas por objetivo**, estendendo o que a arte estática já faz.
- **Legenda queimada** — o vídeo é mudo por decisão. Passa pela mesma
  `problemasDaCopy`: sem valor, sem prazo não cadastrado, sem promessa de
  valorização.
- **Formulário de quatro campos** para quem não tem catálogo aqui.
- **Onde renderiza:** GitHub Actions (já configurado no repo, grátis neste
  volume, ~30 s de partida a frio) ou contêiner a US$ 5–10/mês.

**Portão:** um vídeo sai do começo ao fim sem intervenção, e alguém de fora
não consegue dizer que foi feito por máquina.

### F2 — Fila e créditos, na máquina que já existe · sem serviço novo

- `video_jobs` no Supabase, RLS por corretor, e os dois passos da 0077
  (`revoke` do `anon` e grant por coluna).
- **Cota incluída no plano + crédito avulso.** A cota gera hábito: a
  ~R$ 0,002 por peça, cinco vídeos/mês custam menos de um centavo por cliente.
- Crédito debitado no **mesmo UPDATE atômico** que reserva a vaga de render.
- A tela faz polling, como a de pareamento já faz a cada 5 s.

**Portão:** dois pedidos simultâneos do mesmo corretor não geram dois renders
nem debitam dois créditos. Provado com `begin; … rollback;`.

### F3 — IA de vídeo como upgrade pago · condicional

- Entra como **B-roll de atmosfera**, não como o imóvel: o bairro ao
  entardecer, a cidade de cima. Ninguém promete nada com B-roll.
- Exceção onde desenha o imóvel: `breve_lancamento`, `pre_lancamento` e
  `em_construcao` — sempre com a ressalva queimada no frame.
- Cobrado à parte, nunca dentro da cota.
- **Modelo a definir por medição**, não pelo nome: mesma foto, mesma receita
  de câmera, três rodadas por modelo. Reprovação objetiva — linha reta que
  ondula, geometria que muda, elemento que aparece ou some.

**Portão:** alguém paga o upgrade por vontade própria, duas vezes.

### F4 — Multi-inquilinação · só com cliente pagante

Toda a RLS hoje é por corretor **dentro de uma imobiliária**. SaaS precisa de
uma camada de organização acima, e cada policy e consulta precisam ser
revisitadas — o projeto já tem cicatriz aí (a 0031 quebrou consultas com
`maybeSingle()` em silêncio). Atender os três primeiros clientes na unha antes
de generalizar.

**Portão:** existe cliente pagando.

### F5 — API oficial da Meta · depois da criação de conteúdo

Decisão tomada e deliberadamente adiada. Hoje a instância é o número pessoal
da corretora, e um número banido é desastre para uma imobiliária pequena —
risco que não dá para repassar a cliente pagante. A entrega do vídeo já
funciona: `enviarMidiaWhatsapp` manda `mediatype: video` desde agosto.

## Táticas de rede social que mudam número

- **Os 3 primeiros segundos** decidem o resto. O gancho não pode ser a fachada
  bonita, que é o que todo mundo posta.
- **15 a 25 segundos** converte melhor que 45 em Reels.
- **Loop perfeito** — terminar no mesmo enquadramento em que começou faz o
  Reel repetir sem costura, e replay conta como retenção.
- **Legenda queimada**, obrigatória: a maioria assiste sem som.
- **CTA que pede comentário** ("comenta INFO") alcança mais que "link na bio",
  e comentário vira conversa no WhatsApp, que é onde a assistente já atende.
- Entregar **mudo** é vantagem: o corretor põe o áudio em alta do próprio
  Instagram, que rende mais alcance que trilha embutida.

## Como não ficarem todos iguais

A variação sai do **dado**, não de sorteio — sorteio parece igual depois de
dez vídeos. Cada imóvel tem fotos diferentes com `alt` diferente, e daí sai a
ordem dos planos e o movimento de cada um. Some o que a arte estática já
decide: objetivo, canal e público.

O risco real de repetição não é entre imóveis — é **entre imobiliárias**, no
SaaS. A defesa é a marca entrar como parâmetro: logo, paleta e tipografia do
cliente, não da Next Home.

## Aberto

- **Uma referência visual.** Um vídeo que sirva de alvo vale mais que qualquer
  descrição de "qualidade de produtora".
- **Vídeo mudo precisa ser posição declarada**, não ausência — a interface
  precisa dizer isso em uma linha.
- **Direitos das fotos.** Com o usuário subindo o material, a responsabilidade
  é dele, mas isso precisa estar nos termos de uso antes do primeiro cliente
  externo.
