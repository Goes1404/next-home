---
title: O tradutor era cego, e a instrução mandava descrever a foto
aliases: [sala de estar inventada, edição não é criação, instrucaoDeEdicao]
tags: [ia, armadilha]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/imagens/gramatica.ts
  - src/lib/imagens/tradutor.ts
  - src/lib/estudio/turno.ts
  - src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx
created: 2026-09-15
updated: 2026-09-15
fonte: relato do usuário com print (15/09/2026) + leitura do tipo de `EntradaDoTradutor`
summary: O tradutor é chamada de TEXTO e recebia um booleano, nunca a imagem — mas a instrução dizia "descreva a cena a partir dela". Com a gramática exigindo 200-600 caracteres em quatro seções, inventar era a única saída. Com foto, agora ele escreve só a EDIÇÃO e nomeia as fotos pela posição.
---
# O tradutor era cego, e a instrução mandava descrever a foto

Relatado com print: o corretor anexou a foto de uma **torre**, escreveu
*"Quero que deixe a primeira imagem parecida com a segunda, mas com uma
frase que chame mais atenção e atraia mais clientes"* — e recebeu um
prompt descrevendo **"um apartamento moderno… sala de estar… sofá elegante
e mesa de centro com um catálogo aberto"**. Nada disso estava na foto nem
no pedido.

## A prova está no TIPO, não numa medição cara

```ts
export type EntradaDoTradutor = {
  pedido: string;
  fatos: string[];
  respostas?: { pergunta: string; escolha: string }[];
  promptAnterior?: string | null;
  temReferencia?: boolean;   // ← um BOOLEANO
};
```

E `chamarLlmJson(prompt: string, …)` — texto puro, sem caminho para
imagem. O modelo **nunca recebeu a foto**. Mesmo assim a instrução dizia:

> "Há uma FOTO de referência. Descreva a cena a partir dela."

Não precisou de chamada de API para fechar o diagnóstico: a assinatura do
tipo já responde. **Quando o defeito é "o modelo inventou", a primeira
pergunta é o que ele RECEBEU** — e isso costuma caber num `grep` no tipo.

## Duas ordens que só se cumprem inventando

O segundo metade da armadilha é a gramática (`instrucaoDaGramatica`): ela
exige um parágrafo de **200 a 600 caracteres** cobrindo Cena, Sujeito,
Detalhes e Restrições. Some as duas:

1. descreva uma imagem que você não vê;
2. produza 200+ caracteres de cena, com luz, material e enquadramento.

Há exatamente um jeito de satisfazer as duas ao mesmo tempo, e é inventar.
Saiu uma sala de estar porque é a imagem imobiliária mais provável — o
modelo escreveu a média do corpus dele, que é o que sobra quando não há
informação.

**A régua: instrução impossível não produz recusa, produz invenção
plausível.** É a mesma família do `Torre.` e do "1 suíte" para um cadastro
com 3 — o que não está no prompt, a IA preenche.

## Edição é OUTRO regime, e a gramática de criação não vale nele

Com foto, quem vê a imagem é o gerador (`gpt-image-2`, que recebe
`image[]` com até quatro desde 11/09). O tradutor não precisa — e não
deve — descrever nada. `instrucaoDeEdicao(n)`:

- diz em voz alta que ele **não está vendo as fotos**, e que quem as vê é
  o gerador;
- **proíbe** descrever o conteúdo delas;
- manda escrever só o que **muda, fica ou é enfatizado**;
- trata as fotos pela **posição** ("a 1ª", "a 2ª"), que é como a pessoa
  escreve — é isso que faz "a primeira parecida com a segunda" chegar
  íntegro a quem consegue olhar para as duas;
- manda repetir o pedido relacional **com essas palavras**, em vez de
  adivinhar o que as duas fotos têm em comum.

E o que mudou junto, porque senão a correção se anularia:

| | criação | edição |
|---|---|---|
| seções cobradas | Cena, Sujeito, Detalhes, Restrições | **nenhuma** |
| piso do prompt | 80 | **40** |
| mínimo aceito do motor | 60 | **40** |
| tamanho pedido | 200–600 | 80–500 |

Cobrar "Detalhes: luz, materiais, textura" de um pedido de edição é
exatamente o convite a inventar que a instrução nova veio remover — e
acusaria de incompleto um texto que está certo ("deixe a 1ª foto com a luz
da 2ª" não fala de material, e não deve mesmo). Esta base já perdeu tempo
**seis vezes** com critério que reprova o comportamento correto.

## A zona morta que o teste achou

`MINIMO_ACEITAVEL = 60` ("abaixo disto o modelo não melhorou nada") foi
escrito para criação. Com o piso de edição em 40, sobrava a faixa **40 a
59**: uma instrução de edição legítima — *"Deixe a 1ª foto com o
enquadramento e a luz da 2ª foto."*, 55 caracteres — era jogada fora, o
texto cru do corretor voltava no lugar dela e a tela dizia *"não consegui
melhorar seu pedido"* sobre uma reescrita que tinha ficado boa.

Não veio de produção: apareceu ao escrever o teste do caso novo. **Quando
um limite ganha um irmão, procurar os outros limites que falam do mesmo
regime.**

## O outro relato era o mesmo defeito, visto de fora

*"Não dá para enviar mais de uma foto no chat."* O anexo múltiplo existe e
funciona ponta a ponta desde 11/09 — composer com `multiple`, upload de
todas, `image[]` na rota. Só que `renderAcima` desenhava `m.dados.url`, a
**primeira**. Anexar duas e ver uma é indistinguível de "a segunda não
foi".

**Recurso que não se mostra é indistinguível de recurso que não existe** —
é a irmã da lição de 10/09 ("recurso que o dono do produto não sabe que
existe"). Hoje o balão mostra todas, numeradas; o composer conta as presas
e diz que o clipe **soma** em vez de trocar; e a proposta declara quantas
entraram e em que ordem. A numeração não é enfeite: é ela que dá sentido a
"a primeira" e "a segunda" na frase do corretor.

## Um comentário que tinha virado mentira

`referenciaAtiva` justificava "o último balão vence" com *"o motor de
edição de imagem aceita uma"*. Falso desde 11/09. A regra continua — anexar
de novo é **trocar** a referência, e somar tudo da conversa faria a
terceira tentativa carregar as fotos das duas anteriores — mas pelo motivo
certo. O custo (fotos em mensagens separadas não se somam) deixou de ser
calado.

## O que ficou de fora — e deixou de ficar no dia seguinte

Esta nota fechava dizendo que **o tradutor continuava sem ver as fotos**, e
que dar visão a ele custaria mexer em `llm.ts`. O usuário pediu a visão na
mesma conversa, e ela foi construída: ver
[[o-tradutor-passou-a-olhar-as-fotos]].

O caminho cego descrito aqui **não foi apagado** — virou a degradação.
Vale sempre que não houver provedor com visão configurado (sem
`OPENAI_API_KEY`, por exemplo), e continua inteiro e testado. É por isso
que a decisão de olhar é tomada ANTES de escrever o prompt: prometer visão
a um modelo de texto seria recriar exatamente a instrução impossível que
esta nota registra.

## Relacionadas
- [[o-tradutor-de-prompt-de-imagem]] — por que o tradutor existe
- [[o-contrato-real-do-gpt-image-2]] — `image[]`, `input_fidelity` que não existe, texto literal
- [[llm-conduz-o-briefing-da-imagem]] — quando a IA pergunta, e quando não
- [[MOC — IA e Atendimento]]
