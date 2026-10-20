# Fase 4 enxuta — IA de cada grupo (plano)

> 20/10/2026. Escopo enxuto decidido com o dono: só a IDENTIDADE da
> assistente por grupo. Planner, guardrails e funil não mudam.

## O que o grupo configura

| campo (`grupos`) | o que muda | vazio |
|---|---|---|
| `ia_nome_da_casa` | "consultora ... da **X**", "apresentação digital da **X**", o nome que sai do índice de foco, o fato permitido na variação de lista | Grupo 1: `site.nome` (igual a hoje). Outro grupo: `grupos.nome` |
| `ia_nome_assistente` | o nome com que ela se apresenta | o nome da instância do corretor (como hoje) |
| `ia_regiao` | "em **R**" na apresentação; "em qual região de **R** você procura?" (planner e regra 1 do funil); exemplo da regra 22 | Grupo 1: "Alphaville" na apresentação, "Barueri" na pergunta e os exemplos de hoje. Outro grupo: sem região ("em qual cidade ou bairro você procura?") |
| `ia_tom` | um dos três tons que já existem (`TomVozBot`) | o tom da instância (como hoje) |

**Precedência (decisão do construtor, §17 da spec):** o que o gestor
preenche para o grupo vale para a equipe toda e ganha da instância; campo
vazio deixa valer o que cada corretor escolheu no número dele (hoje é sempre
assim). A tela "Minha IA" do corretor avisa quando o gestor fixou nome ou tom.

**Grupo 1 continua igual:** a migration deixa os quatro campos nulos, e o
padrão do grupo 1 reproduz o texto de hoje letra por letra (teste compara o
prompt antes/depois). `PROMPT_VERSAO` não muda.

## Arquivos

- `supabase/migrations/0199_identidade_da_ia_do_grupo.sql` — quatro colunas
  em `grupos` com CHECK; `grant select` delas ao `authenticated` (0196 recorta
  por coluna); função `atualizar_identidade_da_ia` (`security definer`, só
  gestor ativo, escreve só no grupo dele, grava `admin_eventos`
  `identidade_da_ia_alterada`); CHECK de `admin_eventos` com a ação nova.
- `src/lib/whatsapp/casa.ts` (puro): `IdentidadeDaCasa`, `casaDoGrupo(linha)`,
  `CASA_NEXT_HOME`, `nomeEToomDaAssistente` (precedência), frases da região.
- `src/lib/whatsapp/casaDoGrupo.ts` (server): `lerCasaDoGrupo(grupoId)` pela
  chave de serviço, com retentativa; falha cai no padrão do grupo SEM nome da
  Next Home para outros grupos. Entra no mapa de `servicoComGrupo.test.ts`.
- `aiAgent.ts`: prompt usa `ctx.casa` (apresentação, regra 17, regra 22,
  regra 1 do funil).
- `jogada.ts`: `PERGUNTA_DO_ASSUNTO.regiao` vira função da região do grupo.
- `focoDaConversa.ts`: palavras do nome da casa saem do índice POR GRUPO
  (`nomeDaCasa` opcional em `imoveisCitados`, `detectarFoco`,
  `catalogoParaAtendimento`, `palpiteDeNome`, `removerIndicacaoPrematura`).
- `turnoDeAtendimento.ts`: `identidade.casa` OBRIGATÓRIO (o `tsc` lista cada
  chamador); resolve nome/tom pela precedência e passa a casa adiante.
- Chamadores: webhook, cron de follow-ups, conversas (painel), playground,
  `aberturaPelaIA`, `campaignDispatcher` (fato da casa), scripts de eval
  (`CASA_NEXT_HOME`).
- Tela: `admin/assistente` (gestor) + item no menu (Sistema); aviso na
  configuração da IA do corretor.

## Testes (TDD)

- `casa.test.ts`: padrão do grupo 1 = texto de hoje; outro grupo usa
  `grupos.nome`; precedência grupo × instância; normalização de texto vazio.
- `aiAgent` (prompt): grupo 1 idêntico ao de antes (instantâneo do texto
  gerado antes da mudança); grupo B sem "Next Home", "Barueri", "Alphaville".
- `jogada.test.ts`: pergunta de região com e sem região do grupo.
- `focoDaConversa.test.ts`: nome da casa do grupo B fora do índice; o do
  grupo 1 continua fora.
- Guarda: turno passa `nomeDaCasa` a toda chamada do índice de foco.
- `identidadeDaIa.db.test.ts`: gestor grava só no próprio grupo; corretor
  comum é recusado; outro grupo não é alterado; evento gravado.
