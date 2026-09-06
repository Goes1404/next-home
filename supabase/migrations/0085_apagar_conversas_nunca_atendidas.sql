-- 0085 — Apaga o conteúdo das conversas que o sistema NUNCA tocou
--
-- ## O que este arquivo NÃO faz, e por quê
--
-- A primeira intenção era apagar as 4.178 mensagens de conversas sem
-- `liberado_por_palavra_chave`. **Seria destruição de dado real de
-- cliente.** Aquela flag é UMA das três portas de atendimento; as outras
-- são o número já ser do CRM (`cliente_conhecido`) e a conversa nascer de
-- campanha. Medido antes de executar: o bot havia falado em **26** dessas
-- conversas, **15 vezes nas últimas 24 horas**, e **22** eram elegíveis
-- para o corpus de few-shot.
--
-- ## O critério que sobrou, e ele é pequeno de propósito
--
-- Conversa que ninguém autorizou E que o sistema nunca tocou: o bot nunca
-- falou, o corretor nunca respondeu, nenhuma campanha entrou. São
-- **3 conversas e 6 mensagens**, de 21 a 25/08.
--
-- O resto não é separável por dado. A diferença entre o contato pessoal do
-- corretor e um prospect desconhecido está no CONTEÚDO — que é justamente
-- o que não se quer inspecionar. Para essas, o que muda é daqui para a
-- frente: `privacidadeDaConversa.ts` deixa de gravar o texto.
--
-- ## Apaga a MENSAGEM, mantém a conversa
--
-- A linha da conversa fica: é ela que liga ao lead e que evita recriar
-- registro se a pessoa escrever de novo. E `ultima_mensagem`, que guarda
-- uma cópia de 500 caracteres do último texto, é limpa junto — apagar a
-- mensagem e deixar a cópia no resumo não apaga nada.
--
-- Irreversível, e por isso o recorte está escrito por extenso em vez de
-- confiar num id decorado.

with nunca_autorizadas as (
  select c.id
  from public.whatsapp_conversas c
  where c.liberado_por_palavra_chave = false
    and coalesce(c.cliente_conhecido, false) = false
    and c.origem <> 'campanha'
    -- Nunca tocada: sem uma única fala nossa, de qualquer origem.
    and not exists (
      select 1 from public.whatsapp_mensagens m
      where m.conversa_id = c.id and m.remetente in ('bot', 'corretor')
    )
)
delete from public.whatsapp_mensagens
where conversa_id in (select id from nunca_autorizadas);

update public.whatsapp_conversas c
set ultima_mensagem = null
where c.liberado_por_palavra_chave = false
  and coalesce(c.cliente_conhecido, false) = false
  and c.origem <> 'campanha'
  and not exists (
    select 1 from public.whatsapp_mensagens m where m.conversa_id = c.id
  );
