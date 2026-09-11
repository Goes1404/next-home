---
title: O histórico de conversas diz QUANDO — o dado já vinha e não era desenhado
aliases: [lista-de-conversas, quandoCurto, historico-do-estudio]
tags: [painel, decisao, celular]
type: decisao
status: evergreen
custou: baixo
codigo: [src/lib/quando.ts, src/app/corretor/(painel)/_componentes/ListaDeConversas.tsx]
created: 2026-09-11
updated: 2026-09-11
fonte: pedido do dono do painel em 11/09/2026 ("arrume o histórico, deixe ele visivelmente melhor")
summary: A lista de conversas do consultor e do Estúdio mostrava só títulos parecidos, sem pista de qual era a de ontem — e `atualizadoEm` já chegava do banco sem ser desenhado. Hoje cada linha traz "agora / 14:32 / ontem / sex / 20 ago", o celular deixou de ser um mosaico de pastilhas truncadas, e o × de apagar pede confirmação.
---
# O histórico de conversas diz QUANDO

Três defeitos, em ordem de estrago:

1. **Não dizia quando.** `ConversaDeChat.atualizadoEm` vinha do banco e não
   era desenhado: vinte títulos parecidos, mesmo peso, e o jeito de achar
   uma conversa era abrir uma por uma. Dado carregado e jogado fora — a
   régua do `historico_envios` outra vez.
2. **No celular eram pastilhas que quebravam linha**, cada uma com um
   pedaço de título cortado em `max-w-[70vw]`: um mosaico irregular de
   reticências, que é o oposto de uma lista para escolher. Hoje é lista de
   verdade nos dois tamanhos, com teto de 4 e "ver todas" — o histórico não
   pode empurrar a conversa para fora da tela.
3. **O × de apagar ficava sempre aceso**, do tamanho do título, em toda
   linha: ação destrutiva competindo com a principal, e sem desfazer. Hoje
   aparece no ponteiro ou no foco no computador, continua permanente no
   toque (`opacity-100 md:opacity-0` — `group-hover` não existe no celular)
   e pede confirmação em dois toques.

## As decisões de `quandoCurto`

- **A largura manda.** A coluna tem 14rem no computador: "há 3 dias" não
  cabe junto do título, "20 ago" cabe. Nada de `RelativeTimeFormat` por
  extenso, e o pt-BR escreve "20 de ago. de 25" — os dois "de" saem.
- **Hoje é HORA, não "hoje".** Quem abre o painel de manhã e de tarde tem
  várias conversas do mesmo dia; a hora separa, "hoje" não.
- **O dia é o CIVIL de São Paulo.** Às 00:30, algo das 23:00 é "ontem" para
  quem viveu o dia, e "há 1 hora" para uma subtração de milissegundos — a
  mesma armadilha de fuso que já mordeu seis vezes neste projeto.
- **`agora` também cobre o futuro**: relógio do servidor à frente do
  navegador é ruído, não informação.

Relacionadas: [[placeholder-de-uma-linha-cabe-em-320px]], [[movimento-do-painel-tem-regua]].
