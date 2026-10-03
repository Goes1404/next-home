# Roteiro de testes: ativação da IA no WhatsApp

Plano de ativação, Fase 6.2 (03/10/2026). Um teste por caminho, no número da
Bruna (o único conectado em produção).

**Antes de começar:** use a **palavra de teste** sempre que o caminho permitir.
O lead nasce arquivado (fora do funil, dos relatórios, das listas sugeridas e
das transmissões) e a conversa sai do aprendizado da IA. Para os caminhos que
precisam de um número que não está no CRM, use um celular de teste.

| # | Caminho | Como testar | Resultado esperado |
|---|---|---|---|
| 1 | Lead cadastrado escreve | Do celular de teste já cadastrado como lead, mande "oi" | A IA responde |
| 2 | Link do anúncio `/wa/<imóvel>` | Abra o link no celular de teste e envie a mensagem pronta | Lead criado com origem de anúncio e o imóvel; a IA responde sobre ele |
| 3 | Botões do site | Toque num botão de WhatsApp do site sem imóvel e envie a mensagem pronta | Lead criado; a IA responde |
| 4 | Anúncio da Meta (texto) | Clique num anúncio impulsionado com botão de WhatsApp e envie o texto padrão | Lead criado; anúncio aparece em Anúncios pagos; a IA responde |
| 5 | Anúncio da Meta (áudio) | No mesmo anúncio, mande um áudio como primeira mensagem | Lead criado; o áudio é transcrito e a IA responde |
| 6 | Áudio sem anúncio, número novo | Do celular de teste fora do CRM, mande só um áudio | Ignorado: nada é gravado (decisão de 03/10) |
| 7 | Frase de entrada | Do celular de teste fora do CRM, escreva uma frase cadastrada ("vim pelo anúncio") | Lead criado; a IA responde |
| 8 | Palavra de teste em número novo | Converse com o celular de teste e, do celular da Bruna, mande uma mensagem com a palavra de teste | Lead criado arquivado; conversa marcada como teste; histórico importado ou aviso "Histórico anterior à ativação não foi importado"; se a última mensagem era do cliente, a IA responde |
| 9 | Palavra-chave em número novo | Igual ao 8, com a palavra de ativação | Lead criado na carteira da Bruna, com o mesmo comportamento do 8 (sem marca de teste) |
| 10 | Palavra-chave em lead de outro corretor | Mande a palavra para um número que é lead de outro corretor | A IA não responde; o lead continua com o dono; aviso no Início só para quem digitou, sem o nome do dono |
| 11 | Corretor fala sem palavra-chave | Do celular da Bruna, responda o cliente normalmente | Cabeçalho da conversa: "Pausada até HH:MM porque você falou"; lead em Novo vai para Primeiro contato |
| 12 | Cliente escreve durante a pausa | Depois do 11, mande uma mensagem do cliente | A IA não responde na hora; o Início mostra "Esperando durante a sua pausa"; até 5 min depois de a pausa vencer, a IA responde |
| 13 | Cliente responde à transmissão | Monte uma lista com o celular de teste e responda a mensagem recebida | A IA assume a conversa |
| 14 | Cliente recusa contato | Responda "não tenho interesse" | A IA se despede; lead vai para Perdido; sai das listas sugeridas; o Início avisa por 48 h |
| 15 | Lead transferido | Como ADM, transfira um lead e escreva do cliente para o número do novo corretor | Linha do tempo: "Lead transferido de X para Y pela gestão"; novo corretor vê o resumo e a etapa (não as mensagens antigas); a IA responde sem pedir de novo o que o cliente já disse |
| 16 | Véspera de visita | Marque uma visita para amanhã dentro do expediente | Lembrete enviado entre 8 h e 30 h antes, dentro do expediente da Bruna |
| 17 | Pós-visita e indicação | Visita que aconteceu ontem / lead fechado há 5 dias | Nada é enviado sozinho; o Início mostra a mensagem sugerida com Enviar e Dispensar |
| 18 | Lead de portal novo | Chegada de lead por e-mail de portal ou Lead Ads | Cadastrado na chegada, sem mensagem automática; aparece em "Novos sem primeiro contato" |
| 19 | Palavra-chave discreta | Em Assistente → IA, tente salvar "ok" ou "obrigado" como palavra | Recusado com a explicação; a palavra antiga da Bruna (3 caracteres) continua valendo, com aviso para trocar |
| 20 | Expediente | Mude o expediente para 9h–18h no modo "Noturno e fim de semana" e escreva às 15h de um dia útil | A IA não responde; o cabeçalho diz "Você atende no expediente; a IA volta às 18h" |

## O que não dá para testar ainda

- **Histórico do chat (8 e 9):** a Evolution desta instalação provavelmente não
  guarda mensagens. O primeiro uso real mostra se o histórico vem ou se aparece
  o aviso.
- **Lead de portal (18):** não há caixa de e-mail de portal nem Lead Ads
  configurados (zero leads dessa origem no banco).
