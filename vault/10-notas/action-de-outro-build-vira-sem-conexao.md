---
title: Server Action de outro build vira "Sem conexão" — e manda pagar duas vezes
aliases: [failed to find server action, 404 ao clicar, 500 ao clicar, página velha]
tags: [painel, armadilha]
type: nota
status: evergreen
custou: alto
codigo:
  - src/lib/erros/actionDeOutroBuild.ts
  - src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx
  - src/app/corretor/(painel)/marketing/video/ChatDeVideo.tsx
created: 2026-09-11
updated: 2026-09-11
fonte: relato "404 nas telas" e "500, não funcionou" em 11/09/2026, resolvido pelo log do next dev
summary: Aba aberta durante um build manda ID de Server Action que o servidor não conhece; o POST volta 404/500 e o catch genérico culpa a rede — no Estúdio isso faz alguém pagar de novo por uma arte já salva.
---
# Server Action de outro build vira "Sem conexão"

Relatado em duas rodadas — *"está dando erro 404 nas telas"* e, depois de um
rebuild, *"500, não funcionou da mesma forma"*. As duas eram o MESMO defeito, e
nenhuma delas tinha a ver com o que a tela dizia.

## O que o log mostrou

```
POST /api/imagens/gerar 200 in 24.4s
Error: Failed to find Server Action "4001bb75…". This request might be
from an older or newer deployment.
POST /corretor/imoveis/criar-imagem 404 in 3.2s
```

A imagem **funcionou**: 200, carimbada, 2,58 MB no Storage, linha na galeria
com `expira_em` correto. O que quebrou foi a etapa seguinte —
`registrarArteGerada`, que põe o balão na conversa.

Toda build do Next gera um ID por Server Action. A aba aberta continua com o
JavaScript do build anterior e manda o ID antigo; o servidor responde **404 no
POST da própria rota da página** (é por isso que o sintoma parece "404 na
tela") e o `await` da action **lança** no cliente.

## Por que o diagnóstico apontou para o lugar errado

O `catch` do chamador dizia `"Sem conexão. A imagem pode ter sido gerada"`.
Duas coisas erradas nessa frase:

1. **É falsa.** A conexão estava ótima; o app mudou por baixo da aba.
2. **Manda tentar de novo, que é o que NÃO resolve.** Enquanto a aba não
   recarregar, o ID é o mesmo e o erro se repete para sempre — daí a leitura
   de que "o recurso está quebrado".

No Estúdio o custo é maior: a arte já foi gerada, carimbada, guardada e
**paga** antes dessa etapa. "Sem conexão" faz alguém pagar de novo por uma
imagem que já está na galeria.

## A correção

`ehActionDeOutroBuild` (módulo puro, com teste) separa o caso pelas frases do
próprio Next, e `avisoDePaginaVelha` diz as três coisas que faltavam: o
trabalho não se perdeu, tentar de novo não adianta, e o gesto que resolve é
recarregar. Ligado nos cinco `catch` que culpavam a rede (arte, vídeo,
excluir imóvel).

## Régua

- **`catch` genérico que nomeia uma causa está adivinhando.** Se a tela vai
  dizer "sem conexão", ela precisa ter checado que é conexão — é a mesma
  família do texto de erro desatualizado que aponta o diagnóstico para o lado
  errado, o defeito recorrente nº 5 deste projeto.
- **Quando a falha acontece DEPOIS de algo ter sido pago ou salvo, a mensagem
  tem de dizer isso primeiro.** O usuário decide o próximo passo com essa
  informação.
- **Ao investigar "404/500 ao clicar", o log do servidor separa em uma linha**
  o que horas de varredura de rotas não separam: `next dev` com o stdout
  capturado é mais barato que qualquer hipótese.

## Relacionadas

- [[storage-da-arte-de-ia-tem-teto]]
- [[MOC — CRM e Painel]]
