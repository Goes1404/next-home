---
title: CRM pelo WhatsApp — o número central com IA (desenho aprovado)
aliases: [número central da plataforma, 11 96867-1127, comandos pelo WhatsApp, CRM pelo WhatsApp]
tags: [whatsapp, ia]
type: decisao
status: seedling
custou: medio
codigo:
  - docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md
  - src/lib/agenda/comandos/
  - src/lib/crm/retornoPeloGrupo/
fonte: conversa de desenho com o dono, 30/10/2026 (skill doc-coauthoring, dois testes com leitor sem contexto)
created: 2026-10-30
updated: 2026-10-30
summary: Um número de WhatsApp da plataforma (11 96867-1127) com uma IA que deixa corretores e gestores operarem o CRM inteiro em linguagem natural (texto, áudio, foto), sempre com proposta e "sim" antes de mudar algo. 20 capacidades, piloto na Next Home em 4 ondas. Ainda não construído.
---
# CRM pelo WhatsApp — o número central com IA

Desenho completo: `docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md`.

## Decisões do dono

- Um número para a plataforma inteira; quem escreve é reconhecido pelo
  WhatsApp do perfil. Desconhecido: silêncio.
- Mesmas permissões do painel. **Sempre** proposta e "sim" antes de gravar,
  enviar ou apagar; consulta responde direto.
- O que vai para cliente sai do número do corretor, com as regras
  anti-bloqueio de hoje. O central só conversa com a equipe.
- Modelo de IA de primeira linha com chamada de ferramentas; sem PIN; registro
  só interno; desfazer até 24 h; proposta válida por 1 h.
- Piloto na Next Home, em ondas sem tempo mínimo: 0 fundação → 1 leads e
  agenda → 2 imóveis, relatórios, avisos e grupos → 3 listas e imagens.
  Lançamento é decisão do dono.
- Os comandos contam na cota mensal de IA da imobiliária e podem suspendê-la.
- Cada pessoa escolhe no painel o horário do resumo e a antecedência do aviso
  de visita (padrão 8h e 1 h). Registro guarda o texto por 30 dias.
- O central pode ficar em grupos só da equipe e responde quando mencionado;
  dado de lead vai para o privado de quem pediu.

## Para lembrar (achados do desenho)

- **Laço**: o WhatsApp de cada corretor também está ligado ao sistema. A
  conversa dele com o central apareceria como "cliente" na instância dele, e
  as duas IAs se responderiam. Toda instância de corretor tem de ignorar o
  número central.
- A IA de hoje (`chamarLlmJson`) é JSON de prompt único, sem histórico nem
  ferramentas: o central precisa de um cliente novo.
- As server actions do painel dependem de cookie; as ferramentas do central
  conferem a permissão por conta própria (como `montarDependencias` da agenda).
- O áudio hoje é transcrito depois do canal de comandos da agenda; no central
  tem de vir antes.

Ligações: [[primeiro-contato-tem-teto-proprio]].
