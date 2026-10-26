---
title: Áudio do retorno da ligação — player na ficha e exclusão pela LGPD
tags: [lgpd, whatsapp, crm, armadilha]
type: armadilha
status: growing
custou: medio
codigo:
  - src/lib/crm/retornoPeloGrupo/audioGuardado.ts
  - src/lib/crm/retornoPeloGrupo/audioNoStorage.ts
  - src/lib/crm/retornoPeloGrupo/retornoNaFicha.ts
  - src/app/corretor/(painel)/leads/[id]/LinhaDoTempo.tsx
  - src/app/corretor/(painel)/leads/[id]/acoes.ts
  - src/app/corretor/(painel)/leads/[id]/titularAcoes.ts
  - src/app/corretor/(painel)/leads/acoes.ts
  - src/lib/grupos/encerramento.ts
created: 2026-10-26
updated: 2026-10-26
fonte: spec 2026-10-26-ligacao-primeiro-e-retorno-pelo-grupo-design.md (6.6); Task 9b
summary: O áudio do relato mora em retornos-de-ligacao/<grupo>/<mensagem>.<ext>; a ficha assina link de 1 h no servidor, e o caminho tem de ser lido ANTES de o lead sair, porque o cascade apaga a linha que aponta para o arquivo.
---

# Áudio do retorno da ligação: ficha e exclusão

Parte do fluxo [[vinculo-do-corretor-no-grupo-e-lid]] / retorno pelo grupo.
Continuação em [[encerramento-do-grupo-e-pedido-do-titular]] (LGPD).

## Como é guardado
- Bucket PRIVADO `retornos-de-ligacao`, caminho `<grupo_id>/<mensagem_id>.<ext>`
  (um nível; **não** `<grupo>/<lead>/...`, porque ao guardar ainda não se sabe o
  lead). Relato cujo áudio não foi entendido fica com `audio_path` e
  `lead_id` nulo.
- `retornos_de_ligacao.lead_id` é `on delete cascade`: apagar o lead leva a
  linha, e o arquivo vira órfão sem ninguém que o aponte.

## Ficha
- `getTimelineDoLead` lê `detalhes` das interações; a linha `ligacao` com
  `detalhes.origem = "grupo_whatsapp"` ganha `retorno {resultado, audioUrl}`.
- O link (1 h) é assinado NO SERVIDOR com a chave de serviço, só para caminhos
  das linhas que a sessão acabou de ler e que começam por `<grupo do lead>/`
  (`caminhosDeAudioValidos`). O grupo do lead é lido pela sessão (RLS). Nunca
  se assina caminho vindo do navegador.

## Exclusão (regra: ler antes, apagar depois)
1. Lead (ficha) e lote (lista): lê os caminhos antes do `delete`; só remove os
   arquivos dos leads que o banco de fato excluiu. Falha no Storage só vai ao log.
2. Pedido do titular: o RPC `apagar_dados_do_titular` apaga também as fichas do
   grupo com o mesmo telefone/e-mail. Os caminhos são lidos antes (mesmos
   critérios: telefone igual, `lower(btrim(email))` igual) e os arquivos saem
   depois do RPC; se algum não sai, a mensagem diz que sobraram arquivos.
3. Grupo cancelado (90 dias, `APAGAR_GRUPOS_CANCELADOS`): `apagarPasta` em
   `retornos-de-ligacao/<grupo>/` antes do `apagar_dados_do_grupo` (cobre
   também o áudio sem lead).

## Armadilha achada na revisão
Procurar as outras fichas da pessoa por `LIKE` no e-mail é perigoso: `%` e `_`
no e-mail casam com outras pessoas e o áudio delas seria apagado. A consulta só
estreita; quem decide é a igualdade exata em JS (`caminhosDeAudioDaPessoa`).

## Guarda de chave de serviço
Arquivos novos entram no MAPA de `servicoComGrupo.test.ts`
(`audioNoStorage` = helper; `retornoNaFicha` = por-id; `acoes.ts` das fichas = por-id).
