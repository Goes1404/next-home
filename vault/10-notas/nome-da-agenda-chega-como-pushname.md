---
title: O nome da agenda chega como pushName, misturado com o nome do perfil
tags: [whatsapp, crm, armadilha, lgpd]
type: armadilha
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/contatosDaAgenda.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/lib/whatsapp/provider.ts
created: 2026-10-03
updated: 2026-10-03
summary: Pedido de puxar o nome que a corretora salva na agenda do celular. Pelo código da Evolution v2 e do Baileys 7 rc.9, o caminho existe (contactAction sincroniza o contato para os aparelhos conectados e vira CONTACTS_UPSERT), mas no campo pushName, o mesmo onde a Evolution manda o nome do PERFIL do cliente junto de toda mensagem. Passo 1 no ar, só diagnóstico. O log conta quantos nomes diferem do perfil guardado na conversa e quantos jids são @lid, que não trazem telefone.
---

# O nome da agenda chega como pushName

**A cadeia, lida no código (03/10/2026):** o corretor salva o contato no
celular → o WhatsApp sincroniza com os aparelhos conectados (`contactAction`,
app state) → o Baileys emite `contacts.upsert` com `name = fullName` → a
Evolution manda `CONTACTS_UPSERT` (e, em seguida, `CONTACTS_UPDATE` com a
foto) com `{ remoteJid, pushName: name }`.

**O problema:** a Evolution também manda `CONTACTS_UPDATE`/`UPSERT` a
cada mensagem recebida, com `pushName` = o nome que o CLIENTE pôs no
perfil. É o mesmo campo, e não há marca de origem. Contar "veio um nome" daria
falso positivo a cada mensagem.

**Como o diagnóstico separa os dois:** compara com `nome_cliente` da conversa,
que guarda o primeiro nome de perfil. Se o nome for diferente, é a agenda.
`resumirEventoDeContato` devolve contagens (`diferenteDoPerfil`,
`igualAoPerfil`, `lid`), nunca o nome.

**Riscos em aberto:**
- `remoteJid` pode vir `@lid`: a Evolution descarta o `phoneNumber` que o
  Baileys traz, e sem o telefone não há como achar o lead.
- A versão da Evolution em produção não foi conferida.
- O evento só chega depois de o webhook da instância ser atualizado, o que
  acontece quando a tela Conversas é aberta (`garantirEventosWebhook`).

**Para o passo 2:** o nome da agenda vence o nome de perfil, mas o perfil
não pode sobrescrever a agenda depois. Isso pede uma marca de origem do
nome. A regra "só troca o placeholder `WhatsApp %`" não basta. Contato salvo
nunca cria lead.
