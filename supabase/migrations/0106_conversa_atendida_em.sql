-- 0106 — o FATO "esta conversa é atendimento", separado da PERMISSÃO
--
-- (A spec deste recurso — docs/superpowers/specs/2026-09-10-contexto-da-ia-design.md
-- — foi escrita reservando o número 0103, que já estava ocupado por
-- `parametros_credito`. Renumerada aqui. Colisão de número entre sessões
-- paralelas é o defeito que só aparece no merge, quando o número — a única
-- coisa que define a ordem de execução — já está mentindo.)
--
-- ## O problema, medido
--
-- `decidirPorFalaDoCorretor` RETRAVA a conversa a cada fala do corretor que
-- não seja a palavra-chave, e ele manda ~373 por semana do próprio celular
-- (a instância roda no WhatsApp pessoal dele). Enquanto travada, tudo que o
-- cliente escreve vira `[mensagem não gravada — conversa sem atendimento
-- liberado]`, para sempre.
--
-- Medido sobre 25 conversas atendidas / 5.744 mensagens: **1.007 de 3.181
-- falas do cliente gravadas em branco**, em 10 conversas. Numa delas, 53 de
-- 209; noutra, 14 de 21. E o buraco é de um lado só: a fala do BOT nunca
-- fica em branco, porque ele só fala liberado. Quando destrava, a IA lê um
-- histórico furado e assimétrico.
--
-- ## A separação
--
-- O retravamento CONTINUA — é ele que impede a IA de assumir a conversa da
-- família do corretor (o caso real da conversa da mãe dele). O que muda é
-- que "esta conversa já foi atendida alguma vez" vira FATO gravado, e o
-- texto volta a ser guardado a partir daí.
--
-- Por que coluna nova e não reusar `cliente_conhecido`: essa é lida por
-- `exigeLiberacaoExplicita`, então reusá-la desligaria o retravamento junto
-- — exatamente a opção que o usuário descartou. Fato e permissão só podem
-- discordar se morarem em campos diferentes; é essa discordância que o
-- recurso é.
--
-- Escrita UMA vez (`where atendida_em is null`), pelo mesmo motivo de
-- `desconectado_em` (0071): reescrever a cada resposta faria a marca mentir
-- sobre QUANDO o atendimento começou.
--
-- Grants: só o cliente de serviço escreve. `whatsapp_conversas` não tem o
-- regime de coluna a coluna de `leads` (0007), então coluna nova herda o
-- grant da tabela — conferir `information_schema.column_privileges` antes de
-- escrever `grant` que não precisa existir (0070), e conferir o `anon`
-- (0082).

alter table public.whatsapp_conversas
  add column if not exists atendida_em timestamptz;

comment on column public.whatsapp_conversas.atendida_em is
  'Quando a IA atendeu esta conversa pela primeira vez. FATO, não permissão: a conversa continua podendo ser retravada (a IA cala), mas o texto das mensagens volta a ser guardado. Escrita uma vez só.';

-- Backfill: conversa em que o bot já falou É atendimento, e a data é a da
-- primeira fala dele. Não toca em `liberado_por_palavra_chave`, então não
-- desmuta ninguém — quem está retravado continua retravado.
--
-- As 1.007 falas já em branco são irrecuperáveis: o texto nunca chegou ao
-- banco. O que esta migration conserta é daqui para a frente.
update public.whatsapp_conversas c
   set atendida_em = m.primeira_fala
  from (
        select conversa_id, min(created_at) as primeira_fala
          from public.whatsapp_mensagens
         where remetente = 'bot'
         group by conversa_id
       ) m
 where m.conversa_id = c.id
   and c.atendida_em is null;
