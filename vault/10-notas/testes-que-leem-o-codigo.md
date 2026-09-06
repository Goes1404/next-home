---
title: Testes que leem o código-fonte — a classe de teste da casa
aliases: [escalaDoPainel, camadasGuardas, gravacaoDeMensagem, seo.test]
tags: [teste, licao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/crm/escalaDoPainel.test.ts, src/components/motion/camadasGuardas.test.ts, src/lib/whatsapp/gravacaoDeMensagem.test.ts, src/lib/seo.test.ts, src/lib/crm/leadArquivado.test.ts, src/lib/whatsapp/etapaAutomatica.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — vários
summary: Teste feio, mas é o único jeito de pegar regressões que falham CALADAS sem banco de teste. A regra não é sobre o resultado de uma função — é sobre qual função a tela chama.
---
# Testes que leem o código-fonte

Teste feio, mas é o único jeito de pegar certas classes de regressão sem banco
de teste — regressões que falham **caladas**: o site continua "funcionando", só
errado.

| teste | trava |
|---|---|
| `escalaDoPainel.test.ts` | tela chamando consulta sem teto (`getMeusLeads`) ou gestor contando por `getLeadsDoFunil` |
| `camadasGuardas.test.ts` | camada de parallax em mapa, player, formulário, navegação |
| `gravacaoDeMensagem.test.ts` | ordem gravar-mensagem → telemetria → vínculo nos dois chamadores |
| `leadArquivado.test.ts` | consulta de `leads` sem o filtro de `arquivado_em` |
| `etapaAutomatica.test.ts` | os três caminhos que falam com o cliente mexem no funil |
| `seo.test.ts` | título literal fora da régua nas páginas públicas |
| `navegacao.test.ts` | régua de 5 itens no menu; telas absorvidas não voltam |
| `filaDeTrabalho.test.ts` | ordem da fila do Início (decisão de produto) |

As exceções legítimas ficam registradas **no próprio arquivo de teste**
(ex.: `campanhas/acoes.ts` pode usar a base inteira — não é tela;
`contarLeadsArquivados` olha o outro lado do mesmo filtro).

## Relacionadas
- [[falha-calada-e-a-pior]]
