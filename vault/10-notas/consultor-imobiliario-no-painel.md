---
title: O consultor imobiliário — chat de portfólio e negócio para o corretor
aliases: [consultor, chat do consultor, parâmetros de crédito]
tags: [painel, ia, prompt, supabase, decisao]
type: nota
status: growing
custou: alto
codigo:
  - src/lib/consultor/
  - src/lib/credito/
  - src/app/corretor/(painel)/consultor/
  - src/app/corretor/(painel)/admin/credito/
  - supabase/migrations/0102_consultor_conversas.sql
  - supabase/migrations/0103_parametros_credito.sql
  - supabase/migrations/0104_telemetria_do_consultor.sql
  - scripts/observatorioConsultor.ts
  - scripts/eval/casosDoConsultor.ts
created: 2026-09-09
updated: 2026-09-10
fonte: pedido do usuário ("um assistente de produtos, especialista em negócios imobiliários") + sonda com API
summary: Chat no painel que responde as duas perguntas que o corretor faz todo dia — qual imóvel serve e se fecha. O catálogo inteiro entra no prompt COM preço; a conta é de código; e o guardrail cortava a frase certa porque não entendia "350 mil".
---
# O consultor imobiliário — chat de portfólio e negócio

Spec: `docs/superpowers/specs/2026-09-09-consultor-imobiliario-design.md`
Plano: `docs/superpowers/plans/2026-09-09-consultor-imobiliario.md`

## O que ele responde, e por que não existia

Duas perguntas do dia a dia não tinham resposta em tela nenhuma: **"qual
imóvel serve para esta pessoa?"** (25 publicados, cruzar à mão) e **"isso
fecha?"** (renda, faixa, FGTS, ITBI). A [[sofia-atende-o-cliente]] responde a
segunda para o CLIENTE, no WhatsApp, com a régua invertida — ela é proibida
de falar valores. Faltava a ferramenta do corretor.

## As decisões que custam se forem esquecidas

**O preço ENTRA no prompt deste chat.** Quem lê é o corretor.
`semValores.ts` protege a conversa com o cliente e não vale nesta
superfície — está escrito no código E em teste, para ninguém "consertar"
depois. Ver [[a-ia-nao-fala-valores]].

**A IA não faz aritmética.** Ela EXTRAI (renda, entrada, imóvel) e pede a
simulação; `financiamento.ts` calcula. Duas armadilhas com teste próprio: a
taxa mensal é a EFETIVA (dividir a anual por 12 infla o quanto a renda
sustenta e faz a simulação dizer "fecha" para quem não fecha), e o FGTS tem
teto de VALOR DO IMÓVEL, não de renda.

**A tabela de crédito nasce SEEDADA na migration.** Tela de ajustes que
nasce vazia é o padrão que já matou sete recursos aqui; a tela só EDITA. O
consultor funciona no minuto em que sobe.

**Sem RAG.** 25 fichas completas cabem no prompt inteiras. O ponto de troca
quando o catálogo passar de ~150 é `conhecimento.ts`, e só ele.

## O guardrail cortava a frase CERTA (e só a transcrição mostrou)

Sexta vez que uma régua desta base reprovaria o comportamento certo — ver
[[criterio-decorativo-reprova-o-certo]]. Dois defeitos, os dois achados
**lendo a saída de uma sonda com o modelo real**, nenhum em teste:

1. **"350 mil" era lido como 350.** O extrator comparava com os 350.000 do
   bloco e cortava a frase inteira. Ninguém escreve "R$ 350.000,00" numa
   conversa. Detalhe que ainda mordeu depois: na alternação, `milh…` tem de
   vir ANTES de `mil`, senão "milhão" casa como "mil" e a escala sai mil
   vezes menor.
2. **Os números que o CORRETOR acabou de dar** (renda, entrada, FGTS, valor)
   não estavam nos permitidos — então repetir o que ele disse era tratado
   como invenção. Repetir o que ele disse é o contrário de inventar.

> Nenhum caso escrito à mão usava a forma que gente usa. **Ler transcrição
> não é o que se faz quando falta medição: é medição de outro tipo.**

## A cor: o círculo cromático está cheio

Consultor é tópico próprio no menu e pinta com a cor de **Imóveis**. Não é
economia — é geometria. Seis módulos coloridos mais a rampa ordinal de etapa
(270° a 192°, ver [[rampa-de-etapa-e-o-teto-da-gama]]) já ocupam o círculo, e
todo matiz livre pelos 40° de separação entre módulos cai em cima da rampa
(248° fica a **4°** de `etapa-contato`) ou encosta em `alerta` (66°).
Emprestar a cor do domínio é honesto, e já há precedente do inverso:
`criar-imagem` mora sob `/imoveis` e pinta de Marketing.

## Armadilhas que reapareceram

- **`ChatBase` conhecia o vocabulário do Estúdio** (`proposta`, `resultado`,
  `referencia`). O segundo chat foi quem revelou. Agora ela conhece só
  `pergunta` — chips são mecanismo do chat, não do domínio — e o genérico é a
  MENSAGEM inteira, não só o `dados`: parametrizar só o vocabulário obrigava
  as telas do Estúdio a um cast de volta.
- **`Date.now()` no corpo do componente** reprovou no lint, como já tinha
  acontecido nos Server Components. O relógio saiu para `credito/idade.ts`,
  que de quebra virou a ÚNICA conta do "há quanto tempo" — ela existia em
  dois lugares, e duas contas do mesmo número divergem.
- **A barra do polegar leva 3**, e a guarda de `ATALHOS_MOBILE` pegou sozinha
  quando pus Consultor no grupo "Trabalho". Ele foi para Ferramentas: a barra
  é o que se faz EM PÉ, no corredor.
- **Build quebrou por DUAS sessões editando o mesmo repositório**
  (`MODULE_NOT_FOUND` no export). Dois `next build` no mesmo `.next`: um
  apaga o que o export worker do outro tenta carregar. Diagnóstico: comparar
  o mtime de `.next/BUILD_ID` com o horário do seu build.
- **As migrations foram RENUMERADAS** (0101→0102, 0102→0103, 0103→0104): a
  branch de produção já tinha uma 0101. Colisão de número entre branches é
  pior que buraco — só se revelaria no merge, quando o número, que é a única
  coisa que define a ordem, já estaria mentindo.
- **Script Python que escreve TypeScript transforma `\b` em backspace.** A
  regex virou `/<BS>mil<BS>/` e nunca casou — dois testes falharam de formas
  opostas. `cat -A` foi o que mostrou.

## Verificado

`tsc` 0 · **1490 testes / 135 arquivos, 0 falhas** · `next build` exit 0 ·
`eslint` 0 · `npm run paleta` aprovada · migrations aplicadas em produção e
conferidas NOS DOIS SENTIDOS (`anon` sem privilégio nas três tabelas; gestor
lê e escreve; não-gestor lê e é recusado; comprometimento de 90% e faixas
vazias barrados no banco).

De passagem: `marketing` entrou na lista que `verificarPaleta.mjs` checa —
estava de fora desde que o módulo existe.

## A etapa 5: por que ela não rodava, e o que destravou (10/09)

**O diagnóstico estava errado.** Eu disse que faltavam transcrições. Faltava
antes disso: o consultor **rodava sem deixar linha**. `ia_interacoes.origem`
nem aceitava `'consultor'` (0104), então não dava para saber se foi usado,
quanto custou, nem quantas vezes o guardrail cortou — e "ninguém usou" ficava
indistinguível de "usaram e estava quebrado". Sétima vez que esta base tropeça
na família "construído e nunca ligado", e a primeira em que o zero seria
INVISÍVEL. Ver [[dado-gravado-e-nao-exibido]].

Três degraus, nesta ordem, porque cada um destrava o seguinte:

1. **Rastro** (0104 + `npm run observatorio:consultor`, zero LLM). Responde a
   pergunta que vem ANTES da análise de erro: existe material? Hoje diz
   "nenhum turno registrado" com todas as letras.
2. **Tráfego, mudando o LUGAR.** O consultor é a sétima tela do menu, e esta
   base já mediu que ferramenta atrás de um clique extra não é usada. Agora
   ele fica a um toque: ícone no cabeçalho do Live Chat levando a última fala
   do CLIENTE, e um "com isso, que imóvel serve?" na ficha do lead, com a
   pergunta já montada da qualificação (`perguntaDoLead.ts`, que devolve
   `null` com ficha vazia — botão que leva a lugar nenhum é pior que a
   ausência dele). Medido com o CSS de produção: cabeçalho sem rolagem lateral
   em 320/360/390, alvos de 44px.
3. **Casos derivados do CATÁLOGO** (`npm run eval:consultor`).

### O corpus de conversa real NÃO serve, e isso é LGPD

A ideia era minerar as perguntas de cliente: 369 com "?" em 90 dias. Medido, o
corpus está **contaminado** — o número da instância é o WhatsApp pessoal do
corretor, e a maioria dessas perguntas é da vida privada dele. **Não existe
filtro estrutural**: `cliente_conhecido` e `lead_id` são verdade para as duas
(o webhook cria lead de quem escreve, 0026), e o recorte de atendimento deixa
passar **367 das 369**. A conclusão já estava escrita em 01/09 e vale aqui:
a diferença está no CONTEÚDO, que é justamente o que não se quer inspecionar.
Ver [[conversa-pessoal-do-corretor-no-banco]].

Os 30 casos saem, então, das dimensões do nosso próprio dado — faixas do MCMV
cadastradas, dormitórios que o catálogo tem, cidades onde há imóvel, estágios
que existem — mais as bordas que esta base já pagou para aprender. Mede
COBERTURA, e diz isso em voz alta.

### O que a primeira rodada achou

Cinco falhas, e quatro eram a MESMA: **quando o modelo conclui "não fecha",
ele responde direto e pula a simulação**. E sem `simular`, os números que o
corretor deu não entram nos permitidos do guardrail, então a frase que os
repete leva corte — dois sintomas, uma causa.

"Não fecha" é justamente onde o número mais importa: o corretor precisa saber
QUANTO falta, porque é isso que decide entre pedir mais entrada e mostrar
outro imóvel. A regra 3 passou a dizer isso (prompt **v2**).

Duas rodadas da v2 deram 4 e 2 falhas contra 5 da v1 — mas a v1 tem UMA
rodada, e pela régua de [[uma-rodada-nao-separa-sinal-de-ruido]] isso não é
linha de base. O que moveu de forma legível é o mecanismo: "não simulou" caiu
de 4 casos para 1-2, e a simulação passou a sair em 5-6 contra 3.

## O que ficou de fora

Análise de erro com corpus (`error-analysis`) e juiz calibrado
(`write-judge-prompt` → `validate-evaluator`): a etapa 5 do plano pede
transcrições reais do corretor usando a tela, que ainda não existem. A sonda
de 4 perguntas já pagou por si (achou os dois defeitos acima), mas não
substitui a análise. Custo por turno também não foi medido — o prompt leva o
catálogo inteiro e divide o mesmo saldo da OpenAI do atendimento: sem
crédito, a Sofia cai junto.
