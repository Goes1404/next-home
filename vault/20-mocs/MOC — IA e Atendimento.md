---
title: MOC — IA e Atendimento
tags: [moc, ia, prompt]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-10
summary: Sofia — motor, prompt, comportamento de conversa, WhatsApp.
---
# IA e Atendimento (Sofia) — Map of Content

## Arquitetura
- [[fluxo-do-webhook-whatsapp]] ⚠️ o mapa do caminho inteiro
- [[turno-de-atendimento-e-o-caminho-unico]]
- [[motor-unico-openai]]
- [[historia-da-cascata-de-provedores]]
- [[cota-do-gemini-e-por-modelo-e-por-dia]]
- [[timeout-nao-e-retentado]]
- [[contingencia-nao-cumprimenta-do-zero]]
- [[whisper-nao-recusa-como-o-gemini]]
- [[ia-interacoes-filtrar-por-acao-respondida]]

## Prompt e comportamento
- [[regras-de-conversa-da-sofia]]
- [[a-ia-nao-fala-valores]]
- [[voz-humana-e-funcao-nao-prompt]]
- [[estilo-da-casa-foi-medido]]
- [[quebra-de-mensagens-chunking]]
- [[funil-de-qualificacao-tem-ordem]]
- [[foco-da-conversa]]
- [[o-foco-precisava-da-oferta-solitaria]] — quem se interessa não repete o nome
- [[o-contexto-que-a-ia-realmente-ve]] ⚠️ as sete camadas e os três buracos
- [[privacidade-apaga-o-que-a-ia-depois-precisa]]
- [[o-agendamento-estava-quebrado-em-duas-frentes]] ⚠️ a lista de horários e o planner
- [[reconhecer-nome-do-imovel]]
- [[ficha-do-prompt-completa-e-com-ausencias]]
- [[detector-de-prazo-acusava-a-honestidade]]
- [[midia-por-slug-nunca-por-url]]
- [[recuperar-por-relevancia]]
- [[calendario-misturava-dois-fusos]]
- [[catalogo-do-corretor-e-a-pagina-dele]]
- [[referencia-no-chat-do-estudio]] — Estúdio: clipe de anexo, arte e vídeo
- [[o-contrato-real-do-gpt-image-2]] — sondar a API sem gastar imagem; `input_fidelity` não existe (10/09)
- [[o-tradutor-de-prompt-de-imagem]] — um prompt só, em português, editável antes de gastar (10/09)

## Conversa e estado
- [[rajada-agrupar-conteudo-nao-so-invocacoes]]
- [[trava-aberta-por-padrao-e-ativacao-incompleta]] ⚠️ regra atual da trava (06/09)
- [[trava-de-palavra-chave-e-cliente-conhecido]]
- [[conversa-casa-com-lead-por-telefone]]
- [[gravar-mensagem-antes-do-vinculo]]
- [[aviso-por-evolucao-nao-por-mensagem]]
- [[visita-e-gravada-com-validacao]]
- [[conversa-pessoal-do-corretor-e-gravada]] (LGPD, em aberto)

## Conexão do número
- [[pareamento-decide-pelo-estado]]
- [[trocar-numero-zera-reputacao]]

## Relacionados
- [[MOC — Evals e Medição]] · [[MOC — Campanhas e Anti-ban]] · [[Home]]
