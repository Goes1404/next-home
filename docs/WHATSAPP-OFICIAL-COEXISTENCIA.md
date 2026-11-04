# O que depende da Evolution no número do corretor (F6)

Levantamento de 03/11/2026, fase F6 do `docs/ROADMAP-WHATSAPP-OFICIAL.md`.
**Só mapa: nenhuma linha de código mudou por causa dele.** Serve para decidir
SE e QUANDO o número pessoal de um corretor passa da Evolution (Baileys) para a
API oficial em **coexistência** (o mesmo número no app WhatsApp Business e na
Cloud API ao mesmo tempo).

Base: Evolution v2.3.7 (`infra/evolution/docker-compose.yml:17`). A instância
do corretor assina só 5 eventos — MESSAGES_UPSERT, CONNECTION_UPDATE,
MESSAGES_UPDATE, CONTACTS_UPSERT, CONTACTS_UPDATE (`src/lib/whatsapp/provider.ts:174-180`).
Não usamos lista de transmissão nativa do WhatsApp, reação, botão, enquete nem
localização: a "lista de transmissão" do sistema é uma fila de envios 1:1.

## Antes de tudo: QUAL número migra decide o estrago

"Número central" quer dizer duas coisas no código:

- **Central da plataforma** (`astro-central`, `src/lib/central/constantes.ts:7`):
  instância própria. Não é afetada.
- **Remetente dos grupos de cada imobiliária** (`grupos.envio_grupo_leads_instancia`):
  é a instância do PRÓPRIO GESTOR (`src/app/corretor/(painel)/admin/whatsapp/acoes.ts:81-112`,
  `src/lib/crm/enviosDeLeadParaGrupo.ts:137,178`). As linhas de grupo abaixo só
  quebram se ESTE número migrar. Um corretor comum migra sem tocar nos grupos.

Legenda do impacto: **segue** (igual), **muda** (tem substituto, dá trabalho),
**quebra** (sem substituto, ou o produto como está deixa de existir).

## 1. Inventário (39 capacidades)

| # | Capacidade | Hoje (Evolution) | Impacto | Na Cloud API |
|---|---|---|---|---|
| 1 | Receber mensagem do cliente (`src/app/api/webhooks/whatsapp/route.ts`) | MESSAGES_UPSERT; autenticação por segredo/apikey/token | muda | webhook `messages`, `phone_number_id` → corretor, assinatura `X-Hub-Signature-256`. O GET da Meta já existe (route.ts:270-283), mas o POST não lê formato nenhum da Meta |
| 2 | Resposta da IA em balões + mídia do catálogo | `sendText`/`sendMedia` | muda | mensagem livre dentro das 24 h. **Cada balão vira mensagem de serviço cobrável** acima da franquia |
| 3 | "Digitando…" | `chat/sendPresence` | muda | o indicador da Cloud API marca a mensagem como LIDA (tique azul), o que o robô nunca fez |
| 4 | Tiques de entrega/leitura | MESSAGES_UPDATE por `key.id` | muda | webhook `statuses` por `wamid`; não há estado "falhou" em `ORDEM_ENTREGA` (repositorio.ts:1108) |
| 5 | Prova de envio e classificação de falha (sem WhatsApp, sessão caiu, disjuntor) | erro síncrono `"exists": false`, texto "Connection Closed" | muda | o `wamid` só diz "aceito"; 131026/131047/131049 chegam depois, no `statuses` |
| 6 | Mídia recebida (áudio → transcrição; foto/PDF → bucket) | `chat/getBase64FromMediaMessage` | muda | `GET /{media-id}` dá URL curta; baixar com o token |
| 7 | Nome do contato vira nome do lead | `senderName` | muda | `contacts[].profile.name` |
| 8 | Lead de anúncio Click-to-WhatsApp (impulsionamento, cala a IA, roleta) | `contextInfo.externalAdReply` | muda | objeto `referral` da mensagem |
| 9 | Central invisível + guarda contra laço | lógica nossa sobre MESSAGES_UPSERT | muda | copiar para a rota nova: sem a guarda, a IA do corretor responde ao central em laço |
| 10 | Fala do corretor no celular (grava como corretor, desliga a IA — 0152, visita combinada, funil, transcreve áudio dele) | `fromMe = true` | muda | `smb_message_echoes`. Sem isso a IA fala por cima do corretor (~373 falas/semana; 44% do contexto da IA é fala do corretor, MEMORIA) |
| 11 | Palavra-chave de ativação/teste | `fromMe` | muda | echoes |
| 12 | Co-piloto de 3 min, rótulo "assumiu o teclado" | linhas `fromMe` gravadas | muda | echoes |
| 13 | Saudação automática do WhatsApp Business ignorada | chega como `fromMe` no mesmo segundo | muda (incerto) | não verificado se a saudação do app vem nos echoes |
| 14 | Importar histórico ao cadastrar (`importarHistoricoDoChat`) | `chat/findMessages` | quebra | sem equivalente sob demanda; só a sincronização única de 180 dias no onboarding. **Em produção provavelmente já não traz nada** (`DATABASE_SAVE_DATA_NEW_MESSAGE=false`) |
| 15 | Conferir se o número tem WhatsApp antes da lista | `chat/whatsappNumbers` | quebra | sem substituto: descobre-se no envio (131026, assíncrono); a pausa automática "sem WhatsApp" passa a vir do webhook |
| 16 | Lista de transmissão (texto reescrito pela IA, A/B, `{horarios}`, mídia, listas vivas, lista pelo central) | `sendText`/`sendMedia` livres | **quebra como foi feita** | modelo de marketing aprovado: texto fixo com variáveis (IA não reescreve), ~R$ 0,32 por entregue, consentimento. **É o que a F2 construiu, no número oficial da imobiliária** |
| 17 | Anti-ban (janela 9h–20h59, espaçamento, cota, aquecimento, teto de primeiro contato 10/30 + quarentena, disjuntor, troca de número) | só existe porque o número é comum num gateway não oficial | muda (perde a razão) | limites da Meta: pessoas únicas por 24 h por portfólio, qualidade, 131049 |
| 18 | Lembrete de visita (20 h antes) e pedido de confirmação | `sendText` por iniciativa nossa | muda | modelo de utilidade (~R$ 0,035) com a janela fechada |
| 19 | Resposta atrasada (cliente esperando de 4 h a **7 dias**, `respostaAtrasada.ts:57`) | `sendText` | quebra de 24 h a 7 d | depois de 24 h só modelo; resposta escrita pela IA não cabe em modelo fixo (131047) |
| 20 | Abertura/resposta pela IA no painel; "me avise quando surgir" | `sendText`/`sendMedia` | muda | responder pendência = livre; abrir conversa / avisar novidade = modelo |
| 21 | Live Chat do painel | `sendText`/`sendMedia` | muda | livre dentro das 24 h; fora, a tela precisa oferecer modelo |
| 22 | Envio ao cliente a pedido do central (documentos, material) | instância do corretor | muda | mesma regra da janela (primeiro contato já é recusado hoje) |
| 23 | Roleta dos anúncios, modo "mensagem" (B escreve a quem nunca falou com ele) | `sendText` | quebra para B | modelo pelo número de B |
| 24 | Avisos ao corretor no chat "Você" (alertas, cliente sem resposta, tarefa, reuniões, eventos do link, roleta, relatório semanal, resumo do dia) | `sendText` para o próprio número | quebra (a parte WhatsApp) | a API não manda para o próprio número (131021) e não há chat "Você". O push já sai em paralelo; alternativa: o central |
| 25 | Avisos SEM push de reserva: relatório das avaliações, lembrete de anotação, lista das 18 h ao gestor | só WhatsApp | quebra | central, push ou modelo |
| 26 | Comandos no próprio chat (Agenda fase 5; "A visita aconteceu?" 1/2/3) | `fromMe` no chat consigo | quebra | sem substituto no número do corretor; alternativa: ferramentas de agenda do central |
| 27 | Grupos de leads (aviso de lead distribuído, roleta modo grupo) | `sendText` para `@g.us` pela instância do gestor | segue se um corretor comum migra; **quebra se o gestor migra** | sem substituto (grupo não sincroniza na coexistência) |
| 28 | Retorno da ligação pelo grupo (texto/áudio do corretor vai para a ficha) | MESSAGES_UPSERT `@g.us` + getBase64 | igual à #27 | sem substituto |
| 29 | Aviso "o cliente escreveu" no grupo do novo dono | disparado pela mensagem no número de A | muda se A migra; quebra se o gestor migra | — |
| 30 | Sincronizar grupos, escolher grupo, `@lid` do corretor, grupos na aba Roleta | `group/fetchAllGroups`, `group/participants` | quebra se o gestor migra | sem substituto |
| 31 | Pareamento e desconexão (QR, código de 8, recomeçar, logout) | `/instance/create`, `/connect`, `/delete`, `/logout` | quebra | Embedded Signup (QR uma vez no app Business); número de outras empresas exige Tech Provider + App Review (F5). Logout sem equivalente 1:1 |
| 32 | Estado da conexão (`status_conexao`, `conectado_em`) e quem lê (faixa, primeiros passos, admin, plataforma, saúde) | `instance/connectionState`, CONNECTION_UPDATE | quebra (o conceito) / muda (quem lê) | status, qualidade e limite pela Graph + webhooks da conta. Ninguém monitora a regra dos ~14 dias de celular inativo |
| 33 | Queda do número (401/403, sessão caída, avisos, pausa das listas em 30 min, recomeço do limite, recusa de número de outra conta — 0198) | `fetchInstances`, `statusReason` | quebra | eventos de conta/qualidade da Meta; e esta máquina inteira tem de DESLIGAR para número migrado (surpresa 4) |
| 34 | Rodízio do link do site, link pessoal, roleta que pula desconectado | `status_conexao`/`sessao_caida_em` | muda | alimentar pelo status da Cloud API; o número do wa.me não muda |
| 35 | Sonda de diagnóstico (`sonda.ts`) | chama a Evolution direto, por fora do `provider.ts` | quebra | sem substituto direto |
| 36 | Contatos da agenda | CONTACTS_UPSERT/UPDATE | segue (hoje só registra diagnóstico) | sincronização de contatos da coexistência |
| 37 | Conta "só WhatsApp" (0180) | MESSAGES_UPSERT de todo 1:1 | muda | mensagens + echoes; grupos nunca; passado só pela sincronização única |
| 38 | Central da plataforma e o que sai por ele | instância própria | segue (a menos que o central migre) | — |
| 39 | Push, e-mail, importar conversa exportada (.zip) | nenhum provedor de WhatsApp | segue | — |

## 2. As 5 quebras mais caras

1. **Tudo o que sai por iniciativa nossa (#16, #18–#23).** Lista, lembrete e
   confirmação de visita, resposta atrasada depois de 24 h, roleta modo
   mensagem, "me avise", Live Chat fora da janela. Tudo vira modelo aprovado e
   pago — e a lista foi construída em cima de texto livre reescrito pela IA,
   que modelo não permite.
2. **Grupos de WhatsApp (#27–#30), se o número que migra é o do gestor.** O
   fluxo distribuir-e-reportar não tem substituto: grupo não sincroniza. O
   remetente dos grupos teria de ser outro número, que fica na Evolution.
3. **Fala do corretor pelo celular, `fromMe` → `smb_message_echoes` (#10–#12).**
   Liga e desliga a IA, alimenta a ficha, o co-piloto e a palavra-chave (~373
   falas/semana). Echo atrasado ou ausente = IA falando por cima do corretor.
4. **Conexão, onboarding e saúde (#31–#35).** A máquina só-Evolution tem de
   desligar POR NÚMERO e dar lugar a Embedded Signup, Tech Provider, App Review
   e monitoramento de qualidade e dos 14 dias — enquanto os outros corretores
   continuam na Evolution, num esquema que supõe UMA instância por corretor.
5. **Avisos e comandos no chat do próprio corretor (#24–#26).** A API não manda
   para o próprio número. Relatório das avaliações, lembrete de anotação e a
   lista das 18 h não têm push de reserva; "A visita aconteceu?" perde o canal
   de resposta.

## 3. Surpresas (o que o código não diz no cabeçalho)

1. **`provider.ts` não é o único adaptador**, apesar do que diz o cabeçalho
   dele: `sonda.ts:74-121` chama a Evolution direto; o formato da Evolution é
   lido também em `route.ts` (o POST inteiro), `anuncioMeta.ts`,
   `contatosDaAgenda.ts`, `numerosNoWhatsapp.ts`, `participantesDoGrupo.ts`,
   `retornoPeloGrupo/identificar.ts` e `central/webhook.ts`; texto de erro da
   Evolution é comparado em `listaDeTransmissao.ts:230` (`"exists": false`) e
   `sessaoCaida.ts:32` ("Connection Closed").
2. **O webhook diz que aceita a Cloud API, mas não aceita.** `route.ts:289`
   afirma, o GET responde o `hub.challenge`, mas o POST só lê campos da
   Evolution. (O canal oficial da F1 nasceu em rota própria,
   `src/app/api/webhooks/whatsapp-oficial/route.ts`, justamente para não
   misturar.)
3. **Uma instância por corretor está no esquema e nas consultas**:
   `corretor_id ... unique` e `status_conexao` com os estados da Evolution
   (0018), nome `nexthome-<slug>`, leituras `.eq("corretor_id").maybeSingle()`,
   conversa única por `(corretor_id, telefone_cliente)` sem dimensão de número
   ou canal. Por isso a conversa do número oficial mora em tabela própria
   (`whatsapp_oficial_conversas`, 0256).
4. **O dia da migração dispara os alarmes de "número caiu".** A coexistência
   desliga os aparelhos vinculados (a Evolution é um deles): CONNECTION_UPDATE
   fecha, a instância vira `desconectado`, e daí saem faixa no painel, e-mail e
   WhatsApp do central "seu número caiu", listas pausadas em 30 min, o número
   sai do rodízio do link e da roleta, os avisos por WhatsApp param. **Não
   existe estado "migrado"** para impedir isso.
5. **Mensagem recebida em dobro se a Evolution for religada.** O painel ainda
   deixaria parear. A deduplicação é por `provider_message_id`, e o `key.id`
   da Evolution não é o `wamid`: toda mensagem seria gravada duas vezes. A fala
   do corretor (`fromMe`) é gravada sem `providerMessageId`, então até a
   retentativa de echo duplicaria.
6. **Contrato implícito no ramo `fromMe`**: nada confere se a mensagem foi
   enviada pelo próprio sistema; vale porque a Evolution não manda o que saiu
   pela API como MESSAGES_UPSERT (SEND_MESSAGE não é assinado). Se mandasse,
   cada balão do robô desligaria a IA. `smb_message_echoes` é documentado como
   "só o que saiu pelo app", o que encaixa — confirmar num piloto.
7. **A resposta atrasada sai de propósito até 7 dias depois** do cliente
   escrever. A faixa 24 h–7 dias é exatamente o que a Cloud API proíbe para
   texto livre.
8. **A importação de histórico provavelmente já não funciona em produção** (#14).
9. **Não há registro de quem usa o app WhatsApp Business** (exigência da
   coexistência) e quem usa o WhatsApp comum. A única pista é a heurística da
   saudação automática.
10. **Custo e experiência**: quebrar a resposta em balões multiplica mensagens
    de serviço cobráveis; o "digitando" da Cloud API marca a mensagem como lida.

## 4. A conferir na documentação da Meta antes de decidir

- Sincronização de contatos: pode não ser única (webhook `smb_app_state_sync`). Irrelevante hoje.
- O QR do onboarding é passo único dentro do Embedded Signup, não sessão: nada do pareamento atual é reaproveitável.
- A sincronização de 180 dias de histórico precisa ser pedida logo depois do onboarding, com consentimento no celular.
- Janela gratuita do anúncio Click-to-WhatsApp — **conferido em 03/11/2026** na página de
  preços da Meta: "pode ficar aberta por até 7 dias", a partir da primeira resposta da
  empresa dentro das 24 h, com o cliente no app Android/iOS (desktop e web não contam).
  Enquanto aberta, marketing, utilidade, autenticação e serviço são grátis. (O
  levantamento lembrava 72 h: era a regra antiga.)
- Códigos 131021 (mandar para o próprio número) e 131047 (fora da janela de 24 h).

## 5. Leitura para a decisão

A F6 confirma o desenho do roadmap: **a lista sai pelo número OFICIAL da
imobiliária** (F2, pronto para piloto) e o número pessoal do corretor fica na
Evolution. Migrar o número do corretor para coexistência não é "trocar o
provedor": é refazer o que sai por iniciativa nossa (modelos pagos), perder os
grupos se for o gestor, reconstruir o `fromMe` sobre echoes e desligar, por
número, toda a máquina de conexão e queda. Se um dia valer a pena, a ordem
segura é: (1) estado "migrado" na instância, antes de qualquer outra coisa
(surpresa 4); (2) echoes com deduplicação por `wamid`; (3) modelos de utilidade
para lembrete e confirmação; (4) só então o primeiro corretor-piloto, que NÃO
seja o remetente dos grupos.
