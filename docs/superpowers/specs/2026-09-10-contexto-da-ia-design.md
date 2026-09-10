# O contexto da IA — fechar os três buracos medidos (10/09/2026)

Aprovado em chat. Duas decisões do usuário, tomadas sobre número medido:

1. **Separar FATO de PERMISSÃO** — a conversa continua retravando (o
   corretor segue no controle de quando a IA fala), mas passa a ser marcada
   para sempre como conversa de atendimento, e o TEXTO volta a ser guardado.
2. **Janela de 40 falas com texto, sem teto para o corretor** — mais
   contexto de verdade, ao custo de dobrar as linhas do histórico no prompt.

## O problema, medido

`scripts/traces/medirContexto.ts` sobre 25 conversas atendidas pelo bot /
5.744 mensagens reais:

| | |
|---|---|
| mensagens fora da janela de 20 | 5.337 (93%) |
| falas do CORRETOR dentro da janela | 140 de 315 (44%) |
| falas do CLIENTE gravadas EM BRANCO | 1.007 de 3.181 (32%), em 10 conversas |
| falas úteis (cliente+bot com texto) por conversa longa | **9,5** |
| dossiês | 16 para 131 leads — orçamento 0/16, forma de pagamento 0/16 |

A causa do buraco de 32% é o **vaivém**: `decidirPorFalaDoCorretor` retrava
a conversa a cada fala do corretor que não é a palavra-chave, e ele manda
~373 por semana do próprio celular. Enquanto travada, tudo que o cliente
escreve vira `[mensagem não gravada — conversa sem atendimento liberado]`,
para sempre. Quando destrava, a IA lê um histórico furado — e furado de um
lado só, porque a fala do BOT nunca fica em branco (ele só fala liberado).
Numa conversa real, 53 de 209; noutra, 14 de 21.

## 1. O fato "esta conversa é atendimento" ganha coluna própria (0103)

`whatsapp_conversas.atendida_em timestamptz null`, escrita UMA vez, no
instante em que a IA envia a primeira mensagem — `update … where id = ? and
atendida_em is null`. Escrever a cada resposta faria a marca mentir sobre
QUANDO o atendimento começou, o mesmo motivo pelo qual `desconectado_em`
(0071) é gravado uma vez só.

`conversaEhAtendimento` passa a ter quatro portas: palavra-chave dita ·
cliente já era do CRM · conversa de campanha · **já atendida alguma vez**.

**Por que coluna nova, e não reusar `cliente_conhecido`:** essa é lida por
`exigeLiberacaoExplicita`, então reusá-la desligaria o RETRAVAMENTO junto —
exatamente a opção descartada. Fato e permissão só podem discordar se
morarem em campos diferentes. É essa discordância que o recurso é.

**O que NÃO muda:** `motivoDoSilencio` não lê a coluna nova. Uma conversa
retravada continua muda até alguém liberar; ela só para de perder o texto.

**Backfill na mesma migration:** conversas com fala do bot recebem
`atendida_em` = `min(created_at)` das mensagens do bot. Não toca em
`liberado_por_palavra_chave`, então não desmuta ninguém. As 1.007 falas já
em branco são irrecuperáveis: o texto nunca chegou ao banco.

**Grants:** só o cliente de serviço escreve a coluna. Conferir o regime da
tabela em `information_schema.column_privileges` antes de escrever `grant`
que não precisa existir (0070) e conferir o `anon` (0082).

## 2. A janela vira 40 falas COM TEXTO

`historicoRecente(conversaId, limite = 40)` com
`.neq("conteudo", TEXTO_NAO_GUARDADO)` na própria query: a marca deixa de
ocupar linha, porque ela não ensina nada e gasta lugar.

Medido: **9,5 → 21,8** falas úteis por conversa longa.

Efeito de segunda ordem que importa: o dossiê é extraído da MESMA consulta
(`transcricao` no webhook), então ele também passa a enxergar o dobro — o
que ataca a causa do item 3, não só o sintoma.

**Custo declarado:** até 40 linhas de histórico no prompt, contra 20. O
prompt do agente gasta ~3.400 tokens; o orçamento do webhook (20s de
agente dentro de 60s de função) não muda.

**Consequências conferidas:** `separarRajada` deixa de ver balões em
branco — não é perda, porque balão gravado em branco veio de período não
liberado, em que nenhuma resposta ficou pendente. `midiasJaEnviadas` lê a
nota de auditoria, que vive em mensagem do BOT e nunca está em branco.

## 3. O dossiê para de se apagar

`salvarDossie` faz `upsert` com TODAS as colunas, e a extração só enxerga a
janela: quando o assunto sai dela, o campo volta `null` e o upsert
sobrescreve o que o cliente já tinha dito. `leads` ganhou a guarda contra
null em 24/08 (renda e orçamento); `lead_observacoes_ia` nunca ganhou.

A regra passa a ser: **`null` não apaga**. A leitura do dossiê atual
acontece DENTRO de `salvarDossie`, não no chamador: o webhook já tem um
`dossieAnterior` em mãos, mas passá-lo faria a guarda depender de o chamador
lembrar — e é justamente o esquecimento de um chamador que este projeto já
pagou caro (foi o que tirou `interacaoId` dos parâmetros de
`gravarMensagem`). Sem linha anterior, a primeira gravação escreve tudo como
veio.

Duas exceções deliberadas:

- `temperatura_score` e `temperatura_label` SEMPRE sobrescrevem: são leitura
  do momento, não fato acumulado. Preservar o score antigo faria o
  termostato do `evolucaoConversa` comparar com um número que já não existe.
- Lista (`exigencias_especificas`, `objecoes_identificadas`): vazia não
  apaga; não-vazia SUBSTITUI. União acumularia objeção já superada, e
  objeção morta no dossiê manda a IA tratar um problema que o cliente já
  esqueceu.

## Testes

- **A guarda central** é o par que prova a separação: conversa com
  `atendida_em` + fala do corretor **continua retravando** (permissão
  intacta) **e continua guardando texto** (fato reconhecido). Sem os dois
  lados, o teste não distingue esta correção da opção descartada.
- `conversaEhAtendimento`: a quarta porta, e cada porta sozinha.
- `exigeLiberacaoExplicita` NÃO lê `atendidaEm` — teste explícito, porque é
  a regressão que traria de volta a opção que o usuário recusou.
- `salvarDossie`: `null` não apaga; valor novo substitui; temperatura sempre
  escreve; lista vazia não apaga.
- `historicoRecente`: pede 40 e nunca devolve a marca.
- `medirContexto.ts` reroda sobre o mesmo export: é a prova de campo, e o
  número tem de subir.

## Ordem de implementação

1. 0103 — coluna + backfill, conferida nos dois sentidos (`begin; … rollback;`).
2. `conversaEhAtendimento` ganha a quarta porta (+ testes).
3. O webhook carimba `atendida_em` ao enviar.
4. `historicoRecente`: 40 e sem a marca.
5. `salvarDossie`: merge.
6. Rerodar `medirContexto.ts` e registrar o antes/depois.

## Fora de escopo, declarado

- Recuperar as 1.007 falas já em branco. O texto nunca existiu.
- Mudar quem decide se a IA fala (`motivoDoSilencio`) — foi a opção
  descartada, e mexer nela numa linha que é o WhatsApp pessoal do corretor
  tem o caso real da conversa da mãe dele como precedente.
- Teto de fala do corretor na janela. O usuário escolheu sem teto.
