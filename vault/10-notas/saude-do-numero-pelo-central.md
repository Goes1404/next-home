---
title: Saúde do número pelo central repete a régua da faixa e as contas do disparador
aliases: [saude_do_numero, saúde do número, capacidade 20, quantos primeiros contatos ainda posso]
tags: [whatsapp, anti-ban, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/lib/central/tratadores/saude.ts
  - src/lib/central/tratadores/saude.test.ts
  - src/lib/whatsapp/saudeDaConexao.ts
  - src/lib/whatsapp/primeiroContato.ts
  - src/lib/whatsapp/primeiroContatoNoEnvio.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/listaDeTransmissao.ts
  - src/lib/grupos/servicoComGrupo.test.ts
fonte: onda 3 do número central, frente O (saúde do número), 30/10/2026
created: 2026-10-30
updated: 2026-10-30
summary: saude_do_numero (capacidade 20) responde "meu WhatsApp está conectado?" e "quantos primeiros contatos ainda posso hoje?" só sobre o número de quem pergunta (o gestor, sobre o dele), sem régua nova - conexão por avaliarSaudeDaConexao, cota das listas por calcularLimiteDoDia, primeiro contato por contarPrimeirosContatos + vagasDePrimeiroContato montados como o disparador, e o que fica para amanhã por previsaoDeTermino. Os níveis 10→15→20 por resultado não existem; o central diz o limite atual.
---
# Saúde do número pelo central

`saude_do_numero` (capacidade 20, onda 3) é uma CONSULTA sobre o número de
quem pergunta. O gestor também usa, sobre o número dele; a equipe inteira é
`whatsapp_da_equipe` ([[relatorios-pelo-numero-central]]).

## A decisão: nenhuma conta própria

Se o central disser "cabem 10" e o disparador mandar 0, a confiança no
central acaba no primeiro dia. Cada número sai da função que o envio ou a
tela já usa:

| Pergunta | Função | Quem mais usa |
|---|---|---|
| Está conectado? | `avaliarSaudeDaConexao` (mesmo título e texto) | faixa do painel, e-mail de queda |
| Quanto a lista ainda manda hoje? | `calcularLimiteDoDia` − contador do dia da instância | `reservarCotaCampanha`, tela de listas |
| Quantos primeiros contatos cabem? | `contarPrimeirosContatos` + `vagasDePrimeiroContato`, com início = `inicioDoPrimeiroContato(conectado_em, aquecimento_desde)` | disparador, `liberarPrimeiroContato` |
| Quanto da lista fica para amanhã? | `previsaoDeTermino` (janela ∩ expediente) | tela de listas (`statusDisparo`) |

O teste prova a igualdade: mesma entrada → `listasHoje.limite` igual a
`calcularLimiteDoDia`, `cabemHoje` igual a `vagasDePrimeiroContato` e
`cabemHoje > 0` ⇔ `liberarPrimeiroContato` libera.

## Detalhes que pesaram

- **"conectando" vem antes da régua**: para `avaliarSaudeDaConexao`, número
  não conectado é "saiu do ar". No meio do pareamento isso assusta; o central
  diz que o pareamento não terminou e manda terminar em `/corretor/whatsapp`.
- **Contagem que falha vale zero**, como no disparador: o central diz "não
  consegui contar; enquanto isso nenhum sai", nunca o teto cheio.
- **Nos 7 dias depois de conectar ou voltar de queda**, diz quando o primeiro
  contato volta (início + 7 dias, em SP).
- Pela lista, o primeiro contato também gasta a cota do número: quando a
  cota que sobra é menor que as vagas, a resposta avisa.
- A previsão da lista é a da tela e **não separa** quem nunca falou com o
  corretor (seria um `nuncaFalouComOCorretor` por item). A resposta diz que
  o que passar do teto de primeiro contato fica para amanhã.
- **Níveis por resultado (10 → 15 → 20)** não existem (desenho 3.6 e 5). A
  resposta traz `niveis`: "ainda não há; o limite atual é 10/dia e 30/semana".

## Armadilha de teste

`calcularLimiteDoDia` não recebe cliente nem relógio: lê pela chave de
serviço e usa `Date.now()`. O teste troca `createServiceClient` pelo banco
falso e fixa o relógio com `vi.useFakeTimers({ toFake: ["Date"] })`; sem
isso, o "hoje" do limite e o do central divergem.

## Escopo

Toda leitura filtra `grupo_id` e o corretor da identificação (MAPA de
`servicoComGrupo.test.ts`, categoria `equipe`); os argumentos da IA são
ignorados. Nenhuma conversa é lida: o contador 0222 devolve só o número.

Ligações: [[primeiro-contato-tem-teto-proprio]], [[aquecimento-do-numero-pelo-uso]],
[[central-le-sem-sessao-e-sem-rls]], [[crm-pelo-whatsapp-numero-central-com-ia]].
