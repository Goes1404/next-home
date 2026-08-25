# Eval de conversa — medir o que só aparece ao longo do tempo

> Design aprovado em 24/08/2026. Primeira fase (F0) do roadmap de evolução
> do chatbot. O roadmap completo está na última seção.

## O problema

O eval mede RESPOSTA, nunca CONVERSA.

Cada um dos 36 casos de `eval/golden/casos.json` é um histórico congelado
(de 0 a 6 mensagens) mais uma pergunta, e a nota é dada sobre a resposta a
essa pergunta. A IA nunca conduz nada: ela responde uma vez e o caso acaba.

Isso não é um detalhe de implementação, é um teto. Todo defeito relatado em
produção neste projeto é de conversa, não de resposta:

| defeito relatado | onde ele mora |
|---|---|
| "desfila imóveis, não considera o histórico" | ao longo dos turnos |
| troca de provedor no meio da conversa | ao longo dos turnos |
| responde só o último balão da rajada | ao longo dos turnos |
| reenvia as mesmas fotos a cada duas mensagens | ao longo dos turnos |
| "a Bruna vai te responder" faz o cliente parar | ao longo dos turnos |
| pergunta de novo o que o cliente já respondeu | ao longo dos turnos |

**O eval deu 95,8/100 num agente que fazia todas elas.** Não é um eval
ruim — é um eval que mede outra coisa. Enquanto ele for a régua, "a nota
subiu" e "o atendimento melhorou" são afirmações independentes, e é por
isso que o número não gera confiança para abrir a IA aos leads.

## O que vamos construir

Um cliente simulado que conversa com a Sofia de verdade, do primeiro "oi"
até o desfecho, e um conjunto de medidas sobre a conversa inteira.

### Princípio que não pode ser violado

**O caminho do agente é o MESMO do webhook.** Esta armadilha já pegou este
projeto duas vezes — o playground divergiu, e o eval mandava catálogo cru
sem ranking nem foco, medindo um prompt que produção nenhuma via. Um eval
que roda um caminho próprio mede um agente que não existe.

Consequência de desenho: a composição de um turno de atendimento (ranquear
catálogo → detectar foco → buscar few-shot → gerar → sanear → quebrar em
balões) sai do `route.ts` e vira **`src/lib/whatsapp/turnoDeAtendimento.ts`**,
que webhook, playground, follow-up e eval passam a chamar. É a correção
estrutural que impede a divergência de voltar pela terceira vez.

O que NÃO entra nessa função, de propósito: gravar mensagem, enviar pelo
provedor, telemetria, dossiê e aviso ao corretor. Esses são efeitos do
webhook sobre o mundo — o eval não pode disparar nenhum deles. A função
devolve o que RESPONDER; quem decide o que fazer com isso é o chamador.

## Componentes

### 1. `scripts/eval/personas.ts` — quem é o cliente simulado

Dados, não código. Cada persona declara objetivo, restrições e o
comportamento que ela exercita:

```ts
type Persona = {
  id: string;
  descricao: string;        // "casal, 2 filhos, quer 3 dorm em Barueri"
  objetivo: string;         // o que faria a conversa ser um sucesso para ELE
  restricoes: string[];     // "não passa de X", "precisa em 6 meses"
  comportamentos: Comportamento[];
};

type Comportamento =
  | "escreve_em_rajada"     // manda 2-4 balões seguidos (exercita a v16)
  | "some_e_volta"          // fica em silêncio e retoma depois
  | "insiste_no_preco"      // testa a regra 13
  | "elogia_imovel_alheio"  // testa a regra 23
  | "muda_de_ideia"         // testa a regra 22
  | "pede_foto_varias_vezes"// testa o loop de mídia
  | "escreve_errado";       // testa o reconhecimento de nome
```

Começamos com 6 personas. O critério para a lista inicial não é
imaginação: é um comportamento por defeito já visto em produção ou já
registrado em `docs/MEMORIA.md`.

### 2. `scripts/eval/clienteSimulado.ts` — o próximo balão do cliente

Recebe persona + conversa até aqui, devolve a próxima fala:

```ts
{ mensagem: string | string[], encerrar: boolean }
```

`string[]` porque cliente de verdade manda vários balões, e é isso que a
v16 passou a tratar. Sem isso, o eval nunca exercitaria a rajada.

**O cliente NÃO pode rodar no mesmo provedor do agente.** É a mesma regra
do juiz, pelo mesmo motivo: modelo conversando consigo mesmo produz uma
conversa artificialmente cooperativa — ele entende a própria pergunta mal
formulada e não reproduz o mal-entendido, que é justamente onde o
atendimento quebra. `EVAL_CLIENTE_PROVEDOR` (padrão `groq`) escolhe; se
coincidir com o provedor do agente, o script **aborta**.

Groq como padrão é escolha medida: a fala do cliente é curta (a média
medida da casa é 47 caracteres) e o prompt da persona é pequeno, então o
teto de 8.000 tokens/min — que derruba o agente — não é problema aqui.

### 3. `scripts/eval/rodarConversa.ts` — o laço

```
para cada persona:
  conversa = []
  repita até `encerrar` ou TETO_DE_TURNOS (12):
    fala = clienteSimulado(persona, conversa)
    conversa.push(fala do cliente)
    resposta = turnoDeAtendimento(conversa)   // o MESMO do webhook
    conversa.push(resposta + anexos)
```

Teto de 12 turnos porque as conversas reais que viraram visita fecharam em
5 a 8 mensagens — uma conversa que passa de 12 já é, por si, um sinal.

### 4. `scripts/eval/metricasConversa.ts` — as medidas, sem LLM

Funções puras sobre a conversa terminada. Determinísticas e testáveis, que
é a regra da casa: instrução de prompt é probabilística e falha justo na
resposta que importa; função determinística vale sempre.

| medida | o que reprova | de onde vem a régua |
|---|---|---|
| `turnoDaOfertaDeVisita` | visita oferecida tarde demais, ou nunca | conversas reais que converteram ofereceram na 5ª e 8ª mensagem |
| `midiaRepetida` | mesma URL enviada duas vezes | o loop de fotos visto em produção |
| `perguntaRepetida` | ela repergunta o que o cliente já respondeu | "não considera o histórico" |
| `perguntasNaoRespondidas` | balão da rajada sem resposta | a regra 26 (v16) |
| `imoveisPorMensagem` | mais de 2 numa mensagem | a regra 24 |
| `avancoDoFunil` | nenhum campo novo de qualificação em 4 turnos | andar em círculo |
| `tamanhoDasMensagens` | acima da faixa da casa (120/240) | `estiloDaCasa.ts` |
| `vozConstante` | mais de um modelo na mesma conversa | a troca de voz de 24/08 |

`vozConstante` é redundante hoje — o motor é um só. Existe como guarda de
regressão: se alguém reintroduzir cascata, a métrica acusa.

### 5. Juiz da conversa

UMA chamada por conversa, não por turno. Seis personas = seis chamadas, o
que cabe na cota gratuita de 20/dia do Gemini. Ele responde três coisas
sobre o todo: a conversa avançou, ela soou como a mesma pessoa do começo ao
fim, e — a pergunta que importa — **um corretor de verdade assumiria esta
conversa sem se envergonhar?**

Continua fixo no Gemini, pelo motivo de sempre: juiz que pode cair no
provedor sob avaliação dá nota para si mesmo.

### 6. Saída

`eval/resultados/conversa-<versao>-<data>.json` com as métricas, e a
transcrição legível de cada conversa em `eval/resultados/transcricoes/`.
A transcrição não é enfeite: é o insumo da F1, em que o humano lê e rotula.

## Testes

- `metricasConversa.test.ts`: conversas escritas à mão, sem rede. Cada
  métrica ganha um caso que passa e um que reprova.
- `clienteSimulado.test.ts`: com o LLM dublado — que a persona chega ao
  prompt, que `string[]` vira rajada, e que provedor coincidente aborta.
- O laço ganha um teste de fumaça com agente e cliente dublados: 3 turnos,
  conversa bem formada, nenhuma chamada de rede.

## O que este design NÃO faz

- Não substitui o eval de resposta. Os 36 casos continuam: eles pegam
  regressão pontual barato e rápido. O de conversa é caro e lento.
- Não roda em CI a cada commit. É comando manual (`npm run eval:conversa`),
  pelo custo e pela cota.
- Não mede conversão de verdade. Cliente simulado não compra imóvel.

## Riscos

**O cliente simulado ser cooperativo demais.** É o maior risco: uma
conversa em que tudo dá certo não prova nada. Mitigação: os
`comportamentos` são obrigatórios por persona, e o prompt do cliente
recebe instrução explícita de não facilitar.

**Custo.** ~12 turnos × 2 chamadas × 6 personas ≈ 144 chamadas por rodada.
No `gpt-4.1-mini` é barato; ainda assim `--personas=` roda um subconjunto.

**A métrica virar decorativa.** Já aconteceu quatro vezes aqui —
`deveFazerPergunta` foi declarado em dois casos e lido por ninguém. Regra:
métrica que não aparece no relatório final não entra.

## Roadmap — as fases seguintes

Ordem definida pelo objetivo declarado: **confiar no texto dela antes de
abrir para os leads.**

- **F0 (este spec)** — o eval passa a rodar conversa.
- **F1** — o humano rotula as transcrições; os 👍/👎 (que colheram ZERO
  desde a 0040) viram o golden dataset, e o eval passa a medir o critério
  do corretor em vez de uma rubrica genérica.
- **F2** — os dois defeitos que o eval já sabe apontar: inventar
  especificação ao aprofundar no imóvel em foco, e não avisar quando o
  imóvel não atende à restrição que o cliente acabou de dar.
- **F3** — ativação: a IA atende quem já era do CRM antes desta conversa;
  desconhecido espera a palavra-chave. Junto, os dois defeitos que
  escondiam o problema — o botão "reativar IA" que não destrava
  `liberado_por_palavra_chave`, e o selo "IA atendendo" que ignora essa
  mesma coluna e fica verde numa conversa muda. Mais: teste não pode virar
  exemplo (as conversas de teste atuais estão com `e_teste = false` e
  entram no few-shot como se fossem clientes).
- **F4** — telemetria honesta: `ia_interacoes.modelo` carimba o modelo
  padrão em linha onde ninguém respondeu (1.443 de 1.496).
- **F5+** — renda e orçamento chegando ao CRM (0 de 58 leads hoje), áudio
  (104 recebidos), anexo (12 bloqueios contra 14 envios), e a IA voltando
  sozinha depois que o corretor fala.

## Linha de base medida em 24/08/2026

Antes de abrir para os leads, para haver com o que comparar depois:

| medida | valor |
|---|---|
| respostas da IA na vida (`acao = 'respondida'`) | 47, todas em teste |
| latência média da resposta | 9,9s (com cascata) |
| rótulos humanos | 0 |
| leads com renda ou orçamento | 0 de 58 |
| dossiês | 4 |
| anexos enviados / bloqueados | 14 / 12 |
| áudios recebidos | 104 |
| follow-ups enviados | 0 (13 criados, 13 cancelados) |
