# Traces determinísticos — a sequência de jogadas, sem gastar nada

Cada trace roda `planejarJogada` contra um PERFIL de cliente e imprime a
jogada de cada turno. Não chama modelo nenhum: custa zero, roda em um
segundo, e é determinístico.

```
npx tsx scripts/traces/traceJogadas.ts       # adversarial: só repete "qual o valor exato?"
npx tsx scripts/traces/traceCooperativo.ts   # responde ao funil e aceita a visita
npx tsx scripts/traces/traceObjecao.ts       # responde, depois objeta o preço
npx tsx scripts/traces/traceInteressado.ts   # se interessa pelo imóvel oferecido, sem repetir o nome
```

E um que NÃO simula — lê conversa real exportada e mede foco e desfile:

```
npx tsx scripts/traces/medirFoco.ts conversas.json catalogo.json      # foco e desfile
npx tsx scripts/traces/medirContexto.ts conversas.json catalogo.json  # o que chega ao prompt
```

`medirContexto` responde à queixa "ela não tem contexto" com número: quantas
mensagens ficam FORA da janela de 20, quantas entram sem texto (privacidade) e
quantas das que entram são fala do CORRETOR, não da IA nem do cliente.

## Por que três perfis, e não um

O adversarial mostra se a jogada MUDA quando a atual não funciona. O
cooperativo mostra se o funil ANDA e FECHA — foi ele que revelou que não
existia `confirmar_visita` e que o funil continuava depois da visita
marcada. O da objeção achou as três jogadas que faltavam (tratar objeção,
indicar alternativa, deixar porta aberta). O do INTERESSADO achou o buraco
do foco: quem gosta do imóvel que a IA ofereceu não repete o nome dele, e
sem nome não havia foco — o prompt voltava a dez fichas e a resposta
seguinte desfilava outros empreendimentos.

Um trace com resposta bem-comportada testa o caminho feliz do próprio
regex: foi por isso que nove sondas e três traces não pegaram a regressão
da v32, em que o cliente respondia "pronto" e o planner não reconhecia.

## O que eles NÃO pegam

O que acontece DEPOIS de uma jogada certa — isso precisa de modelo no laço.
E defeito de conteúdo (spec inventada, valor, prazo): para isso, o
observatório e a leitura de transcrição.

## A régua de custo

Nove dos defeitos do planner saíram daqui e de sondas baratas. Antes de
gastar chamada de API, rode os três.
