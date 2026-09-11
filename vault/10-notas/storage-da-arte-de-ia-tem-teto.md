---
title: A arte de IA só termina quando o Storage aceita o arquivo
aliases: [imagem criada mas não guardada, storage da arte de IA]
tags: [midia, supabase, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/app/api/imagens/gerar/route.ts, src/lib/imagens/falhaDeStorage.ts, supabase/migrations/0108_storage_de_artes_ia.sql]
created: 2026-09-11
updated: 2026-09-11
fonte: relato do corretor e leitura do fluxo de geração, 11/09/2026
summary: A chamada ao modelo pode terminar antes de o Storage aceitar a arte; o bucket empreendimentos garante pelo menos 16 MB (sem baixar o teto que o video ja usa) e a rota registra o motivo real da recusa.
---
# A arte de IA só termina quando o Storage aceita o arquivo

"Imagem criada" não é sucesso: a imagem ainda precisa receber a ressalva,
subir ao bucket e virar uma linha na galeria. Antes, a rota escondia qualquer
recusa do Storage atrás de "não deu para guardar", depois de o crédito já ter
sido gasto.

A migration `0108` garante no bucket `empreendimentos` os tipos JPEG, PNG e
WebP (além dos já usados no catálogo) e um teto de **pelo menos** 16 MB. A rota
passa a registrar o código, a mensagem, o tamanho, o MIME e o caminho da
recusa. Assim o próximo incidente separa limite/tipo/permissão de uma falha
genérica.

## Teto de bucket se ELEVA, nunca se crava

Ao aplicar a migration em 11/09/2026, a produção já estava com **50 MB** e com
os cinco mime types exatos — a versão escrita cravava `file_size_limit =
16777216` e teria **baixado** o teto em 3x. E esse bucket não é só da imagem:
`scripts/video/worker.ts` sobe o mp4 renderizado no MESMO bucket
(`corretores/<id>/videos/<hash>.mp4`). Cravar 16 MB faria o render rodar
inteiro, pagar o tempo de CPU do GitHub Actions e morrer no upload — exatamente
a falha "criada mas não guardada" que esta nota existe para impedir, só que do
outro lado.

A forma segura é `greatest(coalesce(file_size_limit, 0), 16777216)`: cumpre a
intenção (garantir espaço para a saída do `gpt-image-2`), é idempotente e não
regride o que outro caminho já precisou.

**Régua**: ao mexer em configuração compartilhada de bucket, ler o estado real
antes de escrever o valor — e procurar quem MAIS escreve ali. Configuração de
bucket não tem dono único.

## A recusa precisa dizer QUAL recusa (11/09/2026)

Relato: *"A imagem foi criada, mas o Storage recusou o arquivo."* A caça pela
causa custou caro e terminou sem reproduzir — e é esse o achado.

Descartado por MEDIÇÃO, contra o bucket de produção e com a chave de serviço:

| hipótese | teste | resultado |
|---|---|---|
| teto de tamanho | PNG de ruído 1024x1536, 4,5 MB | subiu em 3 s |
| mime recusado | `image/png` declarado | aceito |
| policy / prefixo | `corretores/<id>/criacoes/…` | aceito (cliente de serviço ignora RLS) |
| caminho de criação | `gerarImagem` → `carimbarRessalva` → upload | 18 s, carimbo aplicado, 2,66 MB, upload ok |
| caminho de EDIÇÃO (código novo, `image[]`) | 2 referências reais no bucket | 15 s, upload ok |

Produção não tinha log nenhum da rota em 24 h, e a frase do relato **não está
no HEAD** — ou seja, veio do `next dev` local, sobre o working tree.

O que estava de fato quebrado é a TELA: uma frase só para quatro consertos
diferentes (limite, tipo, permissão, rede) obriga quem investiga a abrir o
terminal do servidor. `classificarFalhaDeStorage` (módulo puro, com teste)
separa os quatro e diz se insistir adianta — `rede` é o único transitório.
Marcar uma oscilação de internet como permanente mandaria o corretor avisar o
suporte à toa; marcar limite como transitório o faria repetir para sempre.

**Régua**: antes de acusar o Storage, reproduzir o upload com a chave e o
caminho reais. E quando a falha acontece DEPOIS de o crédito ser gasto, o
motivo pertence à tela, não só ao log.

## Aplicação em produção

Aplicadas as duas em 11/09/2026. Estado conferido depois: teto 50 MB, cinco
mime types, `expira_em` `not null` com default de 48h, índice criado, zero
linhas sem prazo, `anon` sem select na coluna nova. Das 9 artes existentes,
**7 já nascem vencidas** — o primeiro tique de `/api/cron/limpar-artes-ia`
remove arquivo e linha delas.

## Relacionadas

- [[referencia-no-chat-do-estudio]]
- [[upload-de-foto-nunca-funcionou]]
- [[artes-de-ia-expiram-em-48-horas]]
- [[MOC — IA e Atendimento]]
