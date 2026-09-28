---
title: Seis gráficos que decidem, e a regra de que a barra e a lista contam as mesmas pessoas
tags: [painel, crm, admin]
type: decisao
status: evergreen
custou: medio
codigo:
  - src/lib/graficos/calculos.ts
  - src/app/corretor/(painel)/_componentes/graficos/
  - src/lib/corretorSessao.ts
  - src/lib/financeiro/ritmo.ts
  - src/app/corretor/(painel)/financeiro/CartaoMeta.tsx
created: 2026-09-28
updated: 2026-09-28
summary: Seis gráficos, cada um respondendo a uma pergunta que leva a uma ação. Passagem do funil (funil e administração), clientes esperando resposta por tempo (Início), origem dos leads com custo por lead e por visita (Marketing), placar da equipe (administração), procura por imóvel (Imóveis) e a marca do ritmo na meta do mês. Toda barra abre a lista filtrada, e a lista conta as mesmas pessoas. As contas moram num módulo puro com teste.
---

# Seis gráficos que decidem

Cada gráfico responde a UMA pergunta que leva a uma ação:

| Pergunta | Onde |
|---|---|
| Onde os contatos ficam pelo caminho? | Funil e Administração |
| Quem está esfriando? | Início (some quando ninguém espera) |
| Onde meu dinheiro rende? | Marketing |
| Quem da equipe converte? | Administração |
| O que vende e o que encalha? | Imóveis |
| Estou adiantado ou atrasado na meta? | Financeiro (marca na barra) |

## Regras que custaram decisão

- **A barra e a lista que ela abre contam as mesmas pessoas.** Os padrões
  de `?canal=` moram ao lado de `canalDaOrigem`, e um teste simula o `ilike`
  para conferir que os dois concordam (provocado). Links com janela de 90
  dias levam `de=` para a lista cortar no mesmo dia.
- **O funil conta quem passou pela etapa; o link abre quem ESTÁ nela.** Por
  isso a linha de detalhe diz "N nesta etapa agora". Perdidos ficam fora da
  conta: a etapa atual deles não diz até onde foram.
- **Uma cor por série; cor de estado só para estado.** O tempo de espera usa
  ok/alerta/perigo porque ali a cor É urgência, sempre com o tempo escrito.
- **Pequenos múltiplos em tabela** (placar, imóveis): leads, visitas e
  vendas têm escalas diferentes, cada coluna tem a sua. É uma `<table>` de
  verdade, com número escrito em cada célula.
- **Gasto que não existe não vira zero.** Só anúncio tem custo registrado;
  o gráfico diz isso em vez de mostrar R$ 0 por lead para o portal.
- **A meta não projeta o mês.** Comissão chega em degraus; a marca mostra
  onde o valor estaria num ritmo constante, e a frase diz adiantado ou
  atrasado.
- **`so-para-leitor` só esconde abaixo de 640px.** Legenda de tabela e
  cabeçalho escondido usam `sr-only`; com a outra, apareceram no desktop.
- **Alvo de 44px sem abrir espaço**: `-my-3 py-3` no link do nome, não
  `min-h-11`, que empurrava a linha de detalhe para baixo.
