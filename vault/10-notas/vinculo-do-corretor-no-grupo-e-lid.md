---
title: Vínculo do corretor no grupo e o id @lid
tags: [whatsapp, banco, armadilha]
type: armadilha
status: growing
custou: alto
codigo:
  - supabase/migrations/0218_retorno_da_ligacao_pelo_grupo.sql
  - src/lib/whatsapp/participantesDoGrupo.ts
  - src/lib/whatsapp/vinculoNoGrupo.ts
  - src/lib/whatsapp/provider.ts
  - src/app/corretor/(painel)/admin/whatsapp/acoes.ts
created: 2026-10-26
updated: 2026-10-26
fonte: spec 2026-10-26-ligacao-primeiro-e-retorno-pelo-grupo-design.md (6.3, 6.4, 6.6, 7); decisão do dono de não testar na Evolution real
summary: Para o retorno da ligação pelo grupo só valer quando o CORRETOR fala (os gestores também estão no grupo), a sincronização lê os participantes e guarda o @lid dele pelo par número↔lid; grupo que serve a dois corretores é recusado.
---

# Vínculo do corretor no grupo e o id @lid

**Por que existe.** O WhatsApp troca o número do participante por um id `@lid`
dentro de grupos. Gestores estão nos mesmos grupos: sem reconhecer quem falou,
mensagem de gestor viraria "retorno de ligação".

**Regras.**
- `corretores.whatsapp_lid` (0218) é único por grupo quando preenchido.
- O `@lid` só é gravado a partir do par número↔lid da lista de participantes
  (`GET /group/participants/{instância}?groupJid=`), achado com `mesmoNumero`
  (dígitos, com e sem 55, com e sem o 9 do celular; fixo nunca vira celular).
  Nunca por adivinhação ("o primeiro que falou"). Participante só com número no
  id: nada a guardar. Número batendo com dois ids: não grava.
- Par número↔lid aceito: id `@lid` com `phoneNumber`/`jid` ao lado, ou id com
  número e campo `lid` (Baileys). Participante só com número não apaga o `@lid`
  já guardado.
- Dois grupos do WhatsApp com o mesmo nome normalizado: nenhum é vinculado e a
  tela avisa ("Há mais de um grupo chamado X...").
- Todas as FKs de `retornos_de_ligacao` (lead, corretor, envio e `corrige_id`)
  entram no carimbo de grupo, como manda a 0191.
- Falha ao ler os participantes não desfaz o vínculo do grupo (só log), e não
  apaga o `@lid` que já estava guardado.
- Dois corretores no mesmo grupo: nenhum dos dois é vinculado e a tela diz
  "O grupo X serve a mais de um corretor; renomeie para ter um grupo por corretor."
- `unique (grupo_id, mensagem_id)` em `retornos_de_ligacao` (e não só
  `mensagem_id`): chave única de tabela com grupo inclui o grupo (regra da 0192).

**Armadilha achada.** `nomeDeGrupoAretz` acrescentava " & Aretz" também ao nome
do grupo vindo do WhatsApp; `ANDRÉ & ARETZ🟢` virava `ANDRE ARETZ ARETZ` e nunca
casava com o corretor. Hoje só o nome do corretor ganha o sufixo.

**Não verificado numa Evolution real.** Os formatos da lista de participantes
(`id`, `phoneNumber`, `jid`) são os conhecidos da v2, cobertos por testes com
payloads simulados; o formato real do `key.participant` do webhook fica para a
tarefa do webhook.

Relacionado: [[leads-distribuidos-nos-grupos-da-aretz]] · [[MOC — CRM e Painel]]
