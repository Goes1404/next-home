-- Migration 0023: ativação da IA por palavra-chave manual do corretor.
--
-- Problema que resolve: o corretor às vezes quer assumir a conversa
-- pessoalmente logo no início — construir rapport, tirar a primeira dúvida
-- com a própria voz — e só depois "ligar" a IA para tocar o resto, sem o
-- cliente perceber a troca. Hoje qualquer mensagem enviada pelo corretor do
-- próprio celular (`fromMe`) pausa a IA por 24h nessa conversa (ver
-- `pausarBotPorAtendimentoHumano` em repositorio.ts) e não existe caminho de
-- volta dentro da própria conversa — o corretor teria que ir até o painel
-- para reativar. A palavra-chave é esse caminho de volta: o corretor digita
-- uma frase combinada dentro do próprio chat do WhatsApp, e a IA assume a
-- partir dali.
--
-- A lógica de decisão é pura e testada em `modoBot.ts`
-- (`contemPalavraChave`, `exigePalavraChave`); esta migration só guarda o
-- que ela precisa consultar.

alter table public.corretor_whatsapp_instancias
  -- Cadastrada pelo próprio corretor no painel. Nula = recurso desligado,
  -- comportamento idêntico ao que já existia (bot ativo desde a primeira
  -- mensagem, sujeito só ao modo escolhido).
  add column if not exists palavra_chave_ativacao text;

alter table public.whatsapp_conversas
  -- De onde esta conversa nasceu. Hoje só existe 'organica' (o webhook
  -- criando a conversa a partir de mensagem real de cliente); 'campanha'
  -- é o valor reservado para quando o disparador de campanhas em massa
  -- (ainda não implementado — `campaignQueue.ts` hoje só monta a fila, não
  -- a envia) passar a criar conversas de disparo. Conversa de campanha fica
  -- de fora do gatilho de palavra-chave por definição: quem inicia contato
  -- em massa pelo CRM já decidiu que a IA participa, não faz sentido exigir
  -- uma senha que ninguém vai digitar num disparo automático.
  add column if not exists origem text not null default 'organica'
    check (origem in ('organica', 'campanha')),
  -- Falso somente quando a instância tem palavra-chave cadastrada E esta é
  -- conversa orgânica: nesse caso a IA fica muda para o cliente até o
  -- corretor digitar a palavra-chave no próprio chat. Default `true` para
  -- não mudar o comportamento de ninguém que já está rodando sem o recurso.
  add column if not exists liberado_por_palavra_chave boolean not null default true;
