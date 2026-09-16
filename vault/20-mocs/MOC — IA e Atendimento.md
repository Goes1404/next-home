---
title: MOC — IA e Atendimento
tags: [moc, ia, prompt]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-15
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
- [[storage-da-arte-de-ia-tem-teto]] — geração paga só termina quando a arte foi guardada
- [[artes-de-ia-expiram-em-48-horas]] — Storage e galeria temporários; limpeza segura após o prazo
- [[llm-conduz-o-briefing-da-imagem]] — intenção → perguntas → plano → geração
- [[o-contrato-real-do-gpt-image-2]] — sondar a API sem gastar imagem; `input_fidelity` não existe (10/09)
- [[o-tradutor-de-prompt-de-imagem]] — um prompt só, em português, editável antes de gastar (10/09)
- [[o-tradutor-era-cego-e-inventava-a-cena]] — ele recebia um booleano e era mandado descrever a foto; com foto, edição não é criação (15/09)
- [[o-tradutor-passou-a-olhar-as-fotos]] — visão por `llm.ts` (default-off), e o ofício como dado filtrado por regime (15/09)
- [[a-skill-a-vista-sem-tirar-a-visao-do-tradutor]] — duas sessões decidiram o contrário; visão e skill à vista consertam queixas diferentes (16/09)
- [[a-resposta-de-chip-era-jogada-fora]] — o corretor respondia e nada mudava; achado por um warning de lint (10/09)
- [[a-ressalva-legal-volta-por-codigo]] — o aviso de imagem ilustrativa ficou sem dono, e a 1ª versão dava 2,08:1 (10/09)
- [[a-clausula-anti-texto-impedia-o-produto]] — a proibição de escrever na imagem saiu; aspas ditam a manchete (11/09)

## Conversa e estado
- [[rajada-agrupar-conteudo-nao-so-invocacoes]]
- [[trava-aberta-por-padrao-e-ativacao-incompleta]] ⚠️ regra atual da trava (06/09)
- [[trava-de-palavra-chave-e-cliente-conhecido]]
- [[conversa-casa-com-lead-por-telefone]]
- [[a-conversa-fantasma-do-disparo-sem-ddi]] ⚠️ o disparo abria conversa paralela sem DDI (11/09)
- [[gravar-mensagem-antes-do-vinculo]]
- [[aviso-por-evolucao-nao-por-mensagem]]
- [[visita-e-gravada-com-validacao]]
- [[conversa-pessoal-do-corretor-e-gravada]] (LGPD, em aberto)
- [[o-contexto-da-decisao-da-ia]] — por que ela disse aquilo, no balão
- [[fato-e-permissao-moram-em-campos-diferentes]] — o retravamento parou de apagar o texto (0106)
- [[memoria-da-conversa-e-ficha-viva]] — memória em prosa, recusa com consequência e pergunta antes do funil (0110)

## Conexão do número
- [[pareamento-decide-pelo-estado]]
- [[trocar-numero-zera-reputacao]]

## Relacionados
- [[MOC — Evals e Medição]] · [[MOC — Campanhas e Anti-ban]] · [[Home]]
