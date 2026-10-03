---
title: Regras do corretor e horário preferido de visita
aliases: [regras_da_ia, horas_preferidas, blocoRegrasDoCorretor, estagioIncompativel]
tags: [ia, whatsapp, campanhas]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0154_regras_do_corretor_e_horarios_preferidos.sql
  - src/lib/whatsapp/aiAgent.ts
  - src/lib/whatsapp/estagioIncompativel.ts
  - src/lib/whatsapp/recusaDoCliente.ts
  - src/lib/whatsapp/jogada.ts
  - src/lib/whatsapp/saudacaoAutomatica.ts
  - src/lib/crm/agendaDeVisitas.ts
  - src/app/corretor/(painel)/whatsapp/_componentes/ConfiguracaoIA.tsx
  - src/app/corretor/(painel)/visitas/_componentes/GradeDaSemana.tsx
fonte: análise da campanha "Dom" no Instagram (03/10/2026)
created: 2026-10-03
updated: 2026-10-03
summary: A corretora escrevia instruções para a IA dentro do chat da cliente. Agora há "Suas regras para a IA" (texto livre no prompt) e horas preferidas por dia na agenda de visitas. Junto, a IA diz quando o lançamento não é pronto e oferece um pronto, e "apagar meu contato" virou pedido de parada.
---

# Regras do corretor e horário preferido de visita

Três achados da campanha "Dom" (R$ 200, 10 leads, nota 4/10):

1. **A Bruna escreveu as regras para a IA dentro do chat da cliente**, que
   recebeu. Não havia lugar para isso. Hoje: `regras_da_ia` (texto livre,
   até 1500 caracteres) em Minha IA. Entra no prompt logo depois do tom de
   voz (`blocoRegrasDoCorretor`): vale mais que a tarefa do topo quando diz o
   que fazer naquele momento, e nunca acima de não inventar informação,
   prometer data ou oferecer horário fora da lista.
2. **"Sempre sugerir no sábado às 10h ou 14h" é ESTRUTURA, não texto.** A
   lista de horários do prompt diz "só estes existem"; com a grade aberta
   todo dia, os seis primeiros horários acabavam em três dias e o sábado
   nunca chegava ao prompt. `corretor_disponibilidade.horas_preferidas`:
   até duas horas por dia, oferecidas primeiro ("OFEREÇA PRIMEIRO, como o
   corretor pediu"), e o primeiro dia preferido entra mesmo além do teto.
3. **Quer pronto, o foco é lançamento** (`estagioIncompativel`): a IA vendeu
   "a vantagem de pronto" falando de um lançamento de 2030. Agora um bloco
   diz o estágio e o ano e oferece UM pronto (mesma cidade primeiro), que
   fica fora da trava de qualificação. "pronto" solto só vale como resposta
   à pergunta de estágio: sozinho é interjeição.

E o detector de recusa não pegava "Eu quero te apagar meu contato": apagar,
excluir ou bloquear o contato, "me esquece" e "não me liga mais" viraram
pedido de parada. A 0154 marcou esse lead e semeou as regras da Bruna.

## "Peço o Dom Parque e ela me oferece outra coisa" (mesmo dia)

Nas conversas do anúncio a IA nunca citou outro imóvel. O que soava como
oferta de outra coisa era a pergunta de funil: a cliente pedia "informações
do Dom Parque" e ouvia "em qual região de Barueri você procura?" e "prefere
pronto ou na planta?". Quem trouxe o imóvel já respondeu região e estágio:
`estadoDaConversa` ganhou `focoDoCliente` (o nome escrito pelo cliente) e a
próxima pergunta passa a ser a de dormitórios, que é a regra da Bruna.

E um risco escondido: a **saudação automática do WhatsApp Business**
("Oiii Sou eu a corretora Bruna!") chega como fala do número no mesmo
segundo da mensagem do cliente. Desde a 0152 a fala do corretor desliga a
IA, então ela desligaria a IA em todo lead novo do anúncio. O webhook espera
3s, reconhece a saudação (`ehSaudacaoAutomatica`: corretor sem fala nas
últimas 24h e lead de até 12s ou cliente de até 8s) e não a grava: gravada,
ela fecharia a vez do cliente e o webhook dele acharia que já foi respondido.

## Guardas
`regrasDoCorretor.test.ts` (todo caminho do turno passa as regras),
`estagioIncompativel.test.ts`, `agendaDeVisitas.test.ts` (horas
preferidas), `recusaDoCliente.test.ts`, `saudacaoAutomatica.test.ts`,
`jogada.test.ts` (foco do cliente). Mordidas conferidas.

## Relacionadas
- [[quando-a-ia-responde]]
- [[perguntas-antes-da-indicacao]]
- [[lista-de-transmissao-visivel-e-controlavel]]
