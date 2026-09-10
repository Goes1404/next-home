# A conversa abre na lista, e a IA passa a dizer por quê (10/09/2026)

> Status: aprovado em chat, aguardando revisão do documento.

Pedido do usuário, na ordem em que ele o escreveu: *"quero que ao clicar no
card das mensagens, abra a conversa dentro da minha aplicação, e ele consiga
avaliar as respostas da IA através dela, vendo o contexto da IA"*.

Três frentes saíram das perguntas de escopo:

1. **abrir sem sair da lista** — hoje o clique NAVEGA para outra tela;
2. **avaliar com contexto** — o 👍/👎 existe e não mostra o que a IA viu;
3. **conversa travada** — abre uma parede de `[mensagem não gravada]`.

## O que já existe, e não vai ser refeito

A investigação começou pelo que o painel já faz, porque metade do pedido já
estava no ar e o usuário não sabia:

| peça | onde |
|---|---|
| clique no card leva ao chat INTERNO | `ListaPessoas.tsx:123` → `/corretor/conversas?c=<id>` |
| chat com anatomia do WhatsApp, Realtime, envio, mídia, áudio | `ConversasClient.tsx`, função `Chat` (linha 559) |
| 👍/👎 por balão, vinculado à interação (0040) | `Balao` (linha 1277) |
| deep link abre conversa fora das 100 carregadas | `conversas/page.tsx:92` |
| destravar conversa | `assumirConversaComIA` — botão "IA assume agora" |
| fila "N respostas sem revisão" | `RevisaoRespostas.tsx` |

Ou seja: **não existe recurso novo de chat para construir.** O que falta é
onde ele aparece, o que ele explica e o que o banco guarda.

E o que NÃO existe, medido na definição de tipos: `ia_interacoes` tem
`modelo`, `latencia_ms`, `prompt_versao`, `fallback`, contadores de anexo e
`temperatura_score` — e **nada** sobre o que a IA viu ou por que decidiu o
que decidiu. Julgar uma resposta hoje é julgar o texto sozinho.

## 1. A conversa abre em gaveta, sobre a lista de Pessoas

### A extração vem antes, e é commit separado

`Chat`, `Balao`, `FichaLead`, `SeletorDeMidia` e os utilitários de
formatação saem de `ConversasClient.tsx` (1.444 linhas) para
`conversas/Chat.tsx`. `ConversasClient` passa a importar.

**Sem mudar uma linha de lógica**, e em commit próprio. É o maior risco desta
entrega: mexer em comportamento no mesmo commit da mudança de arquivo torna
impossível saber qual das duas coisas quebrou.

### O Realtime da gaveta assina só a conversa aberta

`ConversasClient` assina um canal para a caixa INTEIRA (`conversas-live`,
sem filtro, porque a RLS já recorta por corretor e um `in.(...)` com a
carteira toda estoura o parâmetro). A gaveta não precisa disso: ela tem uma
conversa na tela e nenhuma lista de não lidas para manter.

`useConversaAoVivo(conversaId)`: canal `conversa-live:<id>`, filtro
`conversa_id=eq.<id>`, os mesmos três eventos (INSERT de mensagem, UPDATE de
mensagem para ack de entrega e vínculo de telemetria). O reconcílio de 15s
que já existe continua sendo a rede.

**Nome de canal distinto de propósito.** Dois canais com o mesmo nome no
mesmo cliente Supabase é a classe de defeito que só aparece quando alguém
abre as duas telas em abas irmãs — e falha calada.

### A gaveta

`pessoas/GavetaConversa.tsx`, em portal no `<body>`, com `data-rota="painel"`
e `data-modulo={moduloAtivo(rota)}` **na própria raiz do portal**. Custom
property não herda pela árvore do DOM quando o nó sai dela: sem os dois
atributos a gaveta nasce com a paleta do site e o acento padrão, e a cor
mente — a pedra de 04/09, que já tem guarda em `navegacao.test.ts`.

- Desktop: painel de 480px à direita, véu escurecendo a lista.
- Celular: tela cheia, com voltar no cabeçalho.
- Fecha por véu, Esc e voltar. Armadilha de foco e trava de rolagem copiadas
  de `GavetaLateral.tsx`, que já resolveu isso.

### A URL continua sendo a verdade

Clicar faz `router.replace('/corretor/pessoas?c=<id>', { scroll: false })` e
abre a gaveta — sem navegação. Fechar remove o parâmetro. F5 reabre a
gaveta, porque o servidor lê `?c=` e manda a conversa inicial.

`/corretor/conversas?c=<id>` continua valendo. **Nenhum link salvo quebra** —
a régua da reforma de bolso.

Pessoa **sem** conversa continua indo para `/corretor/leads/<id>`: não há
chat para abrir, e uma gaveta vazia seria pior que a ficha.

`marcarConversaLida` roda ao abrir, como hoje: chat na tela é chat lido.

### O que a gaveta deliberadamente NÃO leva

Lista de conversas (a lista é a de Pessoas, que já está atrás dela) e a fila
de revisão (mora em `/corretor/conversas`, que é a tela do "o que a IA andou
dizendo" — a divisão de papéis registrada em 04/09).

## 2. "Por que ela disse isso" (migration 0105)

`ia_interacoes.contexto jsonb null`. **Não é o prompt.** Guardar 35 mil
caracteres por resposta seria caro, ilegível no celular e — o que decide —
não é o que o corretor precisa para julgar. Ele precisa da DECISÃO:

```
{
  "foco":     { "slug": "...", "nome": "..." } | null,
  "jogada":   { "tipo": "perguntar", "assunto": "capacidade" },
  "dossie":   { "regiao": ..., "dormitorios": ..., "orcamentoMax": ...,
                "rendaMensal": ..., "formaPagamento": ..., "objecao": ... },
  "historico":{ "total": 20, "doCliente": 7, "doBot": 6,
                "doCorretor": 4, "emBranco": 3 },
  "fewShot":  2
}
```

- **`jogada`** sai de `planejarJogada` e hoje morre dentro de
  `executarTurnoDeAtendimento`. É a única mudança no motor: o turno passa a
  DEVOLVER a jogada que já calcula. Nada de recalcular por fora — duas contas
  da mesma decisão divergem, que é o defeito registrado em `montarResumo`.
- **`dossie`** é o que estava valendo NO MOMENTO (`dossieAnterior`, buscado
  antes da resposta), não o reextraído depois. Julgar com o dossiê de depois
  seria julgar com informação que a IA não tinha.
- **`historico`** é a contagem da janela, e `emBranco` é o número que
  importa: `medirContexto.ts` mediu 32% das falas do cliente gravadas em
  branco e 44% da janela ocupada por fala do corretor. Sem esse par, "a IA
  não considerou o que eu disse" e "a IA não recebeu o que você disse" são
  indistinguíveis na tela.

### Onde ela é escrita

No mesmo `insert` de `registrarInteracao` — webhook e follow-up. Um campo
`contexto?: ContextoDaInteracao` em `InteracaoIA`, montado por
`montarContextoDaInteracao(...)`, função **pura**, testável sem banco.

Opcional de propósito: playground, eval e consultor não têm conversa real
para descrever, e forçá-los a inventar um contexto encheria a coluna de
ruído. `null` ali é a resposta honesta — a mesma regra de `modelo`, que já
mentiu duas vezes nesta base por não poder ser nulo.

### Onde ela é lida

Abaixo do balão da IA, recolhida, aberta por um "por quê?" discreto — e
**aberta sozinha ao marcar 👎**, que é o instante em que a pergunta existe.

Resposta antiga: *"contexto não registrado — resposta anterior a esta
versão"*. Decisão do usuário, e é a certa: reconstruir foco e jogada com o
histórico de hoje mostraria uma razão que não foi a real, porque dossiê e
catálogo mudaram desde então.

### Grants

Coluna nova em tabela existente. `leads` é o caso especial desta base
(`revoke update` coluna a coluna, 0007); `ia_interacoes` não tem esse regime
— conferir em `information_schema.column_privileges` antes de escrever
`grant` que não precisa existir (a lição da 0070), e conferir que o `anon`
segue sem privilégio (a varredura da 0082). Quem escreve é o cliente de
serviço.

## 3. A conversa travada explica, e oferece o destravar

Hoje o corpo do chat de uma conversa nunca liberada é uma parede de
`[mensagem não gravada — conversa sem atendimento liberado]`. O texto do
placeholder está certo (linha em branco pareceria defeito), mas repetido
cinquenta vezes ele deixa de informar e vira ruído.

- **Tudo travado** → um cartão único no lugar dos balões: por que não há
  texto (o número da instância é o WhatsApp pessoal do corretor, e ninguém
  autorizou esta conversa), o que muda ao liberar (grava daqui em diante e a
  IA pode responder), e que **o passado continua sem texto** — ele nunca
  chegou ao banco. Botão "IA assume agora" (`assumirConversaComIA`, que já
  existe) em destaque.
- **Misto** → os balões com texto ficam; cada sequência de não gravadas
  colapsa em uma linha `N mensagens não gravadas`.

O critério é `conteudo === TEXTO_NAO_GUARDADO`, comparado com a constante
exportada de `privacidadeDaConversa.ts` — nunca com o literal copiado. Duas
cópias da mesma frase divergem no dia em que alguém melhora o texto.

## Testes

Nenhum teste novo que só afirme o que o compilador já afirma.

| o quê | onde | por quê |
|---|---|---|
| `montarContextoDaInteracao` — contagem de histórico, em branco, foco nulo, jogada | `contextoDaInteracao.test.ts` | função pura; é a conta que a tela mostra |
| webhook e follow-up passam `contexto` a `registrarInteracao` | guarda que LÊ o código-fonte, recortada por função | a regressão falha calada: build verde, tela funcionando, coluna eternamente nula — a mesma família de `gravacaoDeMensagem.test.ts`, e recortada por função porque aquela guarda já quebrou ao existir um segundo caminho de envio |
| gaveta portalada repete `data-rota` e `data-modulo` | `navegacao.test.ts` (guarda já existe, ganha o arquivo novo) | portal fora da árvore = paleta errada, falha calada |
| colapso das não gravadas usa a constante, não o literal | `privacidadeDaConversa.test.ts` | duas cópias do texto divergem |
| numeração e reserva de migration | `migrations.test.ts` (já existe) | 0105 conferido livre em TODAS as branches remotas (a mais alta em cada uma é 0104) |

`naoRolaDeLado.test.ts` e `naoCortaTexto.test.ts` varrem o painel inteiro:
pegam a gaveta nova sem alteração.

**Toda guarda nova é provocada antes de entrar**, com o defeito real, e a
mordida é conferida por md5 — já houve nesta base mordida que não alterou o
arquivo e fez a guarda parecer aprovada.

## Ordem de implementação

1. **Extração** de `Chat` para arquivo próprio, sem mudar lógica.
2. **`useConversaAoVivo`** + `GavetaConversa` + `ListaPessoas` abrindo a
   gaveta.
3. **Estado da conversa travada** (dentro do `Chat` já extraído — barato, e
   vale nas duas telas de uma vez).
4. **0105** + `montarContextoDaInteracao` + o turno devolvendo a jogada +
   escrita no webhook e no follow-up.
5. **Leitura na tela** — o "por quê?" no balão.

Os passos 3 e 5 valem no `/corretor/conversas` de graça, porque o componente
é o mesmo. Isso é consequência da extração, não coincidência.

## Fora de escopo, declarado

- **Resposta bruta vs cortada pelo guardrail** no balão — não escolhido nas
  perguntas de escopo. O dado existe (`respostaBruta`) e cabe em `contexto`
  depois, sem migration nova.
- **O prompt inteiro** — descartado: pesado e ilegível onde o corretor está.
- **Liberar conversas em massa pela lista** — descartado pelo usuário em
  favor do botão dentro da conversa.
- **Reconstruir contexto retroativo** — descartado: mostraria uma razão que
  não foi a real.
- **Instagram Direct** — o pedido original dizia "conversa do instagram"; o
  usuário confirmou que foi engano. Não existe integração de Instagram neste
  projeto (só links de perfil no rodapé e no marketing), e criar uma seria
  canal novo com webhook, envio e conversas próprios — spec própria.

## Um alerta que esta investigação encontrou de passagem

`docs/superpowers/specs/2026-09-10-contexto-da-ia-design.md` (aprovado, ainda
não implementado — `atendida_em` não existe em nenhum lugar do código)
reserva o número **0103**, que já está ocupado por
`0103_parametros_credito.sql`. É a colisão de migration entre sessões
paralelas que esta base já pagou uma vez. Quem for implementar aquela spec
precisa renumerar; esta usa 0105 e não conflita com ela.

As duas mudanças se encaixam sem atrito: aquela faz a conversa já atendida
parar de perder texto daqui em diante; esta explica, na tela, a conversa que
nunca foi atendida — e o passado sem texto continua sem texto nas duas.
