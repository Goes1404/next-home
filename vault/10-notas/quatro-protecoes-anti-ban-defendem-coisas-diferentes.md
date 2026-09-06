---
title: As quatro proteções anti-ban defendem coisas diferentes
aliases: [janela de horário, ignorar_janela]
tags: [anti-ban, campanhas, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/antiBan.ts, supabase/migrations/0058_disparo_fora_da_janela.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — espaçamento anti-ban (0058)
summary: Espaçamento, cota e disjuntor protegem o NÚMERO; a janela 9h-20h59 protege a REPUTAÇÃO. O botão "enviar a qualquer hora" afrouxa SÓ a janela, e há teste para cada uma das outras três.
---
# As quatro proteções anti-ban defendem coisas diferentes

| proteção | defende |
|---|---|
| espaçamento 35-75s | o número (padrão de robô) |
| cota da curva de aquecimento | o número (volume em linha nova) |
| disjuntor de falhas seguidas | o número (comportamento suspeito) |
| janela 9h-20h59 | a **reputação** junto a quem recebe |

Mensagem de propaganda às 3h é o que faz o destinatário **denunciar**, e
denúncia é o sinal mais forte que existe.

## Decisão (0058)

O botão "enviar a qualquer hora" afrouxa **só a janela**; há teste para cada
uma das outras três continuar barrando. Se alguém "simplificar" liberando as
quatro, o botão vira o caminho curto para queimar a linha.

- **A exceção é por CAMPANHA, não configuração global** — é o que a torna
  auditável: com a marca na linha da campanha, o histórico responde sozinho
  quais mensagens saíram de madrugada.
- **Fora da janela o disparador ESTREITA o escopo, não sai.** O `return`
  global antigo faria um disparo urgente ficar parado porque uma campanha comum
  estava na fila do mesmo número. Hoje filtra por `ignorar_janela` e só desiste
  quando não existe nenhuma.
- **Marcar `ignorar_janela` não solta a fila que já existe**: os itens foram
  gravados com `agendado_para` na próxima janela, e o disparador obedece a
  hora. Liberar é marcar a campanha **e reagendar os pendentes a partir de
  agora** com o mesmo espaçamento — sem o segundo passo o botão "parece não
  fazer nada".

## Relacionadas
- [[espacamento-anti-ban-so-existia-no-papel]]
- [[trocar-numero-zera-reputacao]]
