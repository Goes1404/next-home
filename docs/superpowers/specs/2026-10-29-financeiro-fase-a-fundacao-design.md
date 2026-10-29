# Financeiro — Fase A: a fundação do dado

Data: 29/10/2026 · Status: rascunho para aprovação · Pesquisa de base:
`docs/pesquisa/reports/Financeiro de imobiliária inspirações contábeis.md`

## Por que

O módulo financeiro (0114–0169) já é mais largo que o dos sistemas de
imobiliária do mercado, mas nunca foi usado por um cliente. A pesquisa nos
sistemas contábeis (Conta Azul, Omie, Domínio, Alterdata) mostrou que o ponto
fraco não é falta de tela: é **onde o número nasce**. Três coisas fazem o
módulo mostrar número errado sem avisar:

1. **Uma data só** para fatos que a lei separa. A comissão é devida na
   assinatura; o dinheiro entra quando a construtora ou o cliente paga; o
   imposto do Simples e do Presumido é apurado, por padrão, por competência —
   mas hoje a estimativa de imposto usa o regime de caixa
   (`impostosDoMes` recebe a receita paga do mês).
2. **Comissão de uma parcela só.** `vendas.comissao_prevista_em` e
   `comissao_recebida_em` supõem um pagamento único. Na prática a comissão
   vem em parcelas (sinal do comprador, parcelas da construtora).
3. **Distrato apaga o passado.** `movimentosDo` (`lib/financeiro/caixa.ts`)
   ignora a venda distratada inteira: a comissão que JÁ ENTROU e o repasse
   que JÁ FOI PAGO somem do caixa e do Resultado do mês. O extrato preserva
   esse histórico; o caixa não. É defeito.

Além disso, regras fiscais nacionais (tabela do IRRF, redutor da Lei
15.270/2025, teto do INSS, 20% patronal) estão fixas no código, e o padrão do
teto do INSS ainda é o de 2025 (R$ 8.157,41; o de 2026 é R$ 8.475,55,
Portaria Interministerial 13/2026).

Corrigir agora é barato: zero clientes em produção. Depois de meses fechados
com a premissa errada, fica caro.

Esta é a primeira de quatro fases (A fundação · B saldo vindo do banco · C
extrato do corretor · D pacote do contador). B, C e D se apoiam no modelo
desta fase e terão design próprio.

## Objetivos

- **O1. Parcelas de comissão.** Uma venda tem 1..N parcelas de comissão, cada
  uma com valor, vencimento (previsto), pagamento (recebido) e quem paga
  (construtora ou comprador).
- **O2. Três datas por lançamento.** Toda entrada e saída tem competência,
  vencimento e pagamento. Comissão: competência = `data_venda` (assinatura);
  vencimento e pagamento por parcela. Conta a pagar/receber
  (`caixa_lancamentos`): ganha competência (mês), padrão = mês do vencimento.
- **O3. Quem fatura cada parte.** Cada participante da venda é marcado como
  `repasse` (a imobiliária recebe tudo e repassa: o repasse é despesa e a
  comissão inteira é receita bruta da imobiliária) ou `direto` (o corretor
  recebe a parte dele direto do pagador, com nota/recibo próprio: a parte não
  passa pela imobiliária e não é receita dela). Padrão: `repasse` — o
  conservador, e é o que o sistema já faz hoje.
- **O4. Estimativa de imposto no regime certo.** `fiscal_config` ganha o
  regime de apuração (`competencia` | `caixa`, padrão `competencia`, o padrão
  legal). A receita-base do imposto do mês passa a seguir esse regime e a
  marcação de O3.
- **O5. Distrato com efeito financeiro, sem apagar o passado.** O que foi
  pago continua no caixa e no Resultado no mês em que aconteceu. Ao
  distratar, o gestor decide o destino das parcelas ainda não recebidas:
  **manter** (a comissão continua devida — o padrão jurídico quando o
  desfazimento não é culpa do corretor, STJ REsp 1.783.074 e Lei 13.786/2018)
  ou **cancelar**. Motivo obrigatório. Venda distratada continua fora do VGV,
  do ranking e da DIMOB, como hoje.
- **O6. Parâmetros fiscais nacionais versionados.** Tabela do IRRF, desconto
  simplificado, redutor da Lei 15.270, teto do INSS, alíquota do INSS do
  autônomo e patronal saem do código para uma tabela com **vigência (desde)
  e fonte (norma + link)**. O cálculo escolhe a linha vigente na data do
  pagamento. Esses parâmetros são da plataforma (iguais para todo grupo);
  regime e alíquota efetiva do Simples continuam por grupo em `fiscal_config`.
- **O7. Tudo que é fiscal se diz estimativa** enquanto `fiscal_config.
  conferido_em` estiver vazio, com o aviso "confira com seu contador"
  (o padrão de texto já existe nas telas do fiscal).

## Não-objetivos (ficam para fases seguintes)

- Importar extrato OFX, conciliação e saldo vindo do banco → Fase B.
- Extrato do corretor (previsto/liberado/pago/estornado), repasse pago por
  parcela, estorno de repasse já pago, autorização de pagamento → Fase C.
  Nesta fase o repasse continua com uma data de pagamento só
  (`venda_participantes.repasse_pago_em`).
- Fechamento versionado, checklist do mês, pacote ampliado, exportador
  Domínio, NFS-e ligada à comissão → Fase D.
- DRE por competência como tela nova. Nesta fase a competência é gravada e
  usada no imposto; o Resultado do mês continua em caixa (é a pergunta do
  dono: "o mês pagou as contas?").
- Co-corretagem com OUTRA imobiliária como entidade (parceiro externo com
  CNPJ e valor). Hoje o usuário registra só a comissão do seu lado, e isso
  continua.
- Plano de comissão por papel, faixas, teto.

## Anti-objetivos (se acontecer, falhou mesmo funcionando)

- Um número que já foi para o contador (mês fechado, 0168) muda sem o mês ser
  reaberto. Toda escrita nova (parcela recebida, cancelamento de parcela por
  distrato, marcação repasse/direto) respeita `mesFechadoEntre`.
- Uma venda antiga perde dinheiro na migração. A migration converte cada
  venda existente em exatamente uma parcela com o mesmo valor e as mesmas
  datas; a soma por venda bate ao centavo. Guarda de teste confere.
- O corretor passa a ver o que não via (despesa, CPF de comprador, comissão
  de outro). As parcelas seguem a RLS de `vendas` (quem registrou, quem
  participa, gestor) e só o gestor marca parcela recebida (mesmo desenho de
  `marcar_comissao_recebida`: função `security definer` que confere
  `eh_gestor()` e grant de coluna).
- Imposto apresentado como valor apurado, sem a palavra estimativa, antes de
  um contador conferir.
- O celular piora: registrar uma venda simples (uma parcela, todos
  `repasse`) continua com os mesmos toques de hoje. Parcelas ficam atrás de
  "dividir em parcelas"; `direto` só aparece para o gestor.

## Restrições

- Next.js desta versão tem mudanças de API: ler `node_modules/next/dist/docs/`
  antes de código de rota/página (AGENTS.md).
- Multi-grupo: toda tabela nova tem `grupo_id` e respeita o padrão da 0191/0192
  (default do grupo da sessão, policies por grupo). Exceção desenhada: a
  tabela de parâmetros fiscais nacionais é da plataforma, leitura para
  `authenticated`, escrita só por migration/serviço.
- Migration nova a partir de **0232**, aplicada em produção pela skill local
  `aplicar-migration-producao`. Antes de mexer em RLS/migration, buscar o
  assunto em `docs/MEMORIA.md` (grep, não carregar inteira).
- Dinheiro em `numeric(14,2)`; contas em `lib/financeiro/*` puras, com
  `centavos()`; valor em % e R$ gravados juntos quando o usuário digita um
  deles (decisão da 0114).
- Painel mobile-first (diretriz do produto: 100 leads por corretor, uso no
  celular).
- Guardas de teste do projeto que leem migrations (`vendasSeguras.test.ts`,
  `tabelasSeguras.test.ts`) precisam continuar passando e ganhar os casos
  novos.
- Fechamento da tarefa atualiza o vault (nota atômica + MOC) e a MEMORIA,
  pela skill `fechar-tarefa`.

## O que foi decidido e por quem

Decidido com o usuário nesta conversa:
- Usuário principal do financeiro: o dono/gestor. Pergunta-guia: "quanto
  entra e sai, o que está atrasado, quanto disso é meu depois de corretor e
  imposto?".
- Posicionamento: ser o "cliente fácil" do contador, não um ERP.
- Ordem das fases A → B → C → D, e começar pela A.
- Sem imobiliária piloto agora (haverá no futuro): regras fiscais
  configuráveis e marcadas como estimativa até um contador conferir.
- **Distrato e "recebe direto" são só do gestor.** Os dois mudam o dinheiro
  e o imposto da imobiliária. O corretor perde a capacidade de marcar
  distrato que tem hoje (tirar o grant de update de `status` e
  `distratada_em` para `authenticated`; `salvar_venda` recusa mudança de
  status e de forma de recebimento vinda de quem não é gestor; a guarda
  `vendasSeguras` ganha esses casos). No lugar, o corretor tem um botão
  "avisar distrato" na venda, que cria um alerta para o gestor (reusar as
  regras de alerta do financeiro, 0169) e não muda nada sozinho. Gestor
  grava pela mesma via de `security definer` que já marca comissão recebida.

Chamadas minhas (o usuário pode reverter):
- Competência da comissão = `data_venda` (assinatura). Alternativa seria a
  data de emissão da NFS-e; fica anotada para o piloto confirmar.
- Regime de apuração padrão = `competencia`.
- Padrão de cada participante = `repasse`.
- Distrato: o gestor escolhe manter ou cancelar as parcelas abertas; não há
  padrão pré-marcado (obriga a escolha consciente). Motivo obrigatório.
- Parcelas entram já nesta fase (e não na C), porque distrato e competência
  dependem delas.
- Repasse por parcela fica para a Fase C; aqui, o "liberado" do corretor
  passa a ser proporcional ao recebido (repasse × recebido ÷ soma das
  parcelas), só como leitura.
- **`direto` e as parcelas.** `comissao_valor` continua sendo a comissão
  cheia do lado da imobiliária, com as partes `direto` dentro (como na 0114,
  onde o repasse é fatia da comissão). As parcelas são só o que a
  IMOBILIÁRIA recebe: soma das parcelas = `comissao_valor` − soma das partes
  `direto` (validação ao salvar). Receita-base: competência = essa mesma
  diferença no mês da venda; caixa = parcelas recebidas no mês.
- **Distrato no regime de competência: ajuste no mês do distrato, nunca no
  mês da venda.** O mês da venda fica como estava (o fato aconteceu). As
  parcelas canceladas viram um ajuste negativo na receita-base do mês do
  distrato (cada parcela cancelada guarda a data do cancelamento =
  `distratada_em`). `mesFechadoEntre` confere o mês do distrato. É o padrão
  dos sistemas contábeis da pesquisa ("ajuste no mês seguinte", sem reescrever
  mês fechado). Parcelas mantidas seguem normais.
- **Repasse na venda distratada e no fluxo.** Repasse ainda não pago:
  com "manter", continua devido inteiro; com "cancelar", cai na mesma
  proporção das parcelas canceladas (repasse devido = repasse × parcelas não
  canceladas ÷ soma das parcelas). No fluxo de 13 semanas, o repasse previsto
  acompanha as parcelas: cada parcela gera a fatia proporcional do repasse
  na mesma data. A marcação de pago continua uma só (`repasse_pago_em`)
  até a Fase C.
- **Desfazer distrato:** o gestor pode, enquanto o mês do distrato estiver
  aberto; as parcelas canceladas por ele voltam a abertas.

## Deixado para quem constrói

- Forma exata da tabela de parcelas e da de parâmetros fiscais; nomes de
  coluna; se as colunas antigas `comissao_prevista_em` /
  `comissao_recebida_em` são removidas na mesma migration ou mantidas
  sincronizadas por um período — desde que nenhum leitor fique lendo dado
  velho (guarda de teste que procura os nomes antigos fora da migration).
- Como `salvar_venda` passa a gravar parcelas na mesma transação (precedente:
  venda + participantes já são gravados juntos).
- Layout das telas, contanto que o caminho simples não ganhe toques.
- Ajustes nos módulos que leem comissão: caixa (`movimentosDo`, fluxo de 13
  semanas), resultado, previsão, alertas, fiscal (impostos, DIMOB), pacote do
  mês, IA do financeiro (o bloco de números calculados).

## Como saber que deu certo

- Teste: venda distratada com comissão recebida em março continua somando
  em março no Resultado e no caixa; parcelas abertas canceladas não aparecem
  no fluxo; parcelas mantidas aparecem.
- Teste: venda com 3 parcelas, a 2ª recebida → caixa mostra 1 recebida e 2
  previstas; liberado do corretor proporcional.
- Teste: participante `direto` → receita-base do imposto exclui a parte dele;
  todos `repasse` → receita-base = comissão inteira (comportamento de hoje).
- Teste: regime `competencia` → imposto do mês soma comissões com
  `data_venda` no mês; `caixa` → soma parcelas recebidas no mês.
- Teste: RPA de pagamento em 2026 usa teto R$ 8.475,55 e o redutor; um
  pagamento datado de 2025 usa a linha de 2025.
- Guarda: migração mantém soma de comissão por venda ao centavo.
- Guarda: escrita em mês fechado é recusada para parcela e distrato.
