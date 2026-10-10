---
title: O estado do número só o servidor escreve
aliases: [0175, estadoDoNumero, grant de corretor_whatsapp_instancias, webhook_secret]
tags: [banco, anti-ban, armadilha]
type: armadilha
status: growing
custou: baixo
codigo:
  - supabase/migrations/0175_estado_do_numero_so_o_servidor_escreve.sql
  - src/app/corretor/(painel)/whatsapp/acoes.ts
  - src/lib/whatsapp/estadoDoNumero.test.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/lib/tabelasSeguras.test.ts
fonte: revisão da 0174 (10/10/2026); pedido "Ajuste isso"
created: 2026-10-10
updated: 2026-10-10
summary: 'O authenticated tinha insert/update/delete de TABELA em corretor_whatsapp_instancias e a policy do dono é "for all": pela API, o corretor podia zerar o contador do dia, apagar aquecimento, disjuntor e espaçamento, voltar ao rodízio com a sessão caída, gravar um segredo de webhook próprio ou trocar o nome da instância. Desde a 0175 a sessão só altera a configuração da assistente; conectar, desconectar e criar a linha vão pela chave de serviço.'
---

# O estado do número só o servidor escreve

## O buraco

`corretor_whatsapp_instancias` guarda, na mesma linha, a configuração da
assistente (nome, tom, modo, palavras-chave, expediente, regras) e o estado
do número (conexão, contador do dia, disjuntor, espaçamento, aquecimento,
sessão caída). O `authenticated` tinha o grant padrão do Supabase (INSERT,
UPDATE, DELETE e TRUNCATE de tabela) e a única policy é
`so o dono ... for all`. Os dois juntos deixavam o corretor reescrever a
própria linha pela API, com a chave pública e a sessão dele:

- zerar `envios_campanha_contador` e mandar mais mensagens no dia;
- pôr `conectado_em` no passado ou apagar `aquecimento_desde` e pular o
  aquecimento depois de uma queda;
- apagar `bloqueado_ate` e `proximo_envio_permitido_em` e furar o disjuntor
  e o espaçamento;
- apagar `sessao_caida_em` e voltar ao rodízio do link com a sessão morta;
- gravar um `webhook_secret`, que o webhook aceita como senha da instância
  (`requisicaoAutenticada` em `route.ts`), e forjar mensagens de cliente que
  a IA responderia pelo número dele;
- trocar `instance_name` pelo nome da instância de um colega que ainda não
  conectou e receber as mensagens dele.

Medido antes de fechar: as 6 linhas estavam íntegras (nome da instância
igual ao do corretor, nenhum `webhook_secret`, `conectado_em` coerente).
Nada indica que o buraco tenha sido usado.

## O que mudou (0175)

- **Banco**: o `anon` perde tudo nesta tabela; o `authenticated` lê a linha e
  altera só a configuração (`nome_assistente`, `tom_voz`, `modo_bot`,
  `palavra_chave_ativacao`, `palavra_chave_teste`, `palavras_entrada_cliente`,
  `expediente_inicio`, `expediente_fim`, `regras_da_ia`, `updated_at`). Sem
  INSERT, DELETE nem TRUNCATE.
- **Código** (`whatsapp/acoes.ts`): conectar e desconectar gravam o estado
  pela chave de serviço, depois de conferir a sessão. Salvar a configuração
  cria a linha pelo servidor quando ela não existe (o nome da instância não
  sai do navegador) e atualiza a configuração pela sessão, ainda sob a RLS.
- Webhook, crons e disparador já usavam a chave de serviço e não mudaram.

## Armadilhas

- **Upsert pela sessão não funciona com grant por coluna**: ele faz UPDATE de
  todas as colunas enviadas, inclusive a chave (lição da 0115). Por isso a
  configuração virou "linha pelo servidor + update pela sessão".
- **Linha que já existe mantém o nome da instância.** O upsert antigo
  reescrevia `instance_name` a cada salvamento; se o slug do corretor
  mudasse, o nome deixaria de bater com a instância criada na Evolution e as
  mensagens do número parariam de chegar.
- **Esta migration vai DEPOIS do deploy**, ao contrário do normal: o código
  antigo gravava o estado da conexão pela sessão, e o conectar ignorava o
  erro. Com a 0175 no ar antes do código novo, conectar deixaria de registrar
  a conexão, calado.
- A policy `for all` ficou: quem limita é o grant. Trocar a policy exigiria
  `drop policy`, que o MCP cancela.

## Conferido no banco (10/10, depois do deploy de 0caeca7)

- **Antes**: `authenticated` com INSERT, UPDATE e DELETE de tabela (inclusive
  em `envios_campanha_contador` e `webhook_secret`); o `anon` também tinha
  SELECT de tabela, sem linha nenhuma pela RLS.
- **Depois**: `authenticated` lê e altera só as 10 colunas de configuração;
  sem INSERT, DELETE nem TRUNCATE; `anon` sem nada; `service_role` intacto.
- **Com a sessão de um corretor**, numa transação desfeita por exceção: vê 1
  linha (a dele), a configuração atualiza 1 linha, e contador,
  `conectado_em`, `webhook_secret`, `instance_name` e insert são recusados.
- As funções que escrevem nesta tabela (cota, devolução) são
  `security definer` sem execute para o `authenticated`; nenhuma view a lê.
  Os crons responderam 200 depois da migração, sem `permission denied` no
  log da Vercel.

## Guarda

`estadoDoNumero.test.ts`: o último grant de coluna libera exatamente a
configuração; nenhuma coluna de estado entra nessa lista; nenhuma migration
depois da 0175 devolve grant de tabela; toda gravação pela sessão no código é
update dessas colunas; gravação com cliente que o teste não identifica
reprova. Provocada com cinco mordidas (estado pela sessão, upsert pela
sessão, coluna de estado no grant, sem o revoke de tabela, grant de tabela
numa migration nova): todas reprovaram.

## Relacionadas
- [[queda-do-numero-pausa-a-lista-e-diz-o-motivo]]
- [[aquecimento-do-numero-pelo-uso]]
- [[espacamento-anti-ban-so-existia-no-papel]]
- [[vendas-e-o-modulo-financeiro]]
- [[grant-por-coluna-em-leads]]
- [[MOC — Banco de Dados]]
- [[MOC — Campanhas e Anti-ban]]
