---
title: Falha calada é a pior — o padrão-mãe do projeto
aliases: [regressão silenciosa, erro engolido]
tags: [licao]
type: nota
status: evergreen
custou: alto
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — todo o arquivo
summary: O defeito mais caro do projeto nunca é o erro que aparece — é o caminho que falha devolvendo null, logando em console.error, ou funcionando de mentira. Índice dos casos.
---
# Falha calada é a pior — o padrão-mãe

O defeito mais caro deste projeto nunca é o erro que aparece — é o caminho que
falha devolvendo `null`, logando em `console.error`, ou "funcionando" de
mentira. Casos:

- [[telefone-e164-e-coluna-gerada]] — nenhum lead nascia, erro ignorado
- [[gravar-mensagem-antes-do-vinculo]] — FK violada, mensagens não gravadas
- [[cron-do-hobby-e-1x-por-dia]] — deploy recusado sem log
- [[grant-por-coluna-em-leads]] — update afeta 0 linhas
- [[upload-de-foto-nunca-funcionou]] — "Verifique sua conexão"
- [[whisper-nao-recusa-como-o-gemini]] — "." vira fala do cliente
- [[pareamento-decide-pelo-estado]] — formulário vazio sem explicação
- [[contar-e-listar-sao-consultas-diferentes]] — contagem errada plausível
- [[envio-mandava-telefone-sem-ddi]] — defeito nosso vestido de dado ruim

## Como o projeto responde

1. **Medir produção** ([[medir-producao-nao-confiar-em-parece-funcionar]])
2. **Falha fechada** em trava de segurança
   ([[o-lado-certo-de-errar-numa-trava]])
3. **Testes que leem o código** ([[testes-que-leem-o-codigo]]) para regressões
   que falham caladas
4. Correção **por construção** — parâmetro que só pode ser usado errado não
   deve existir

## Relacionadas
- [[dado-gravado-e-nao-exibido-e-dado-perdido]]
