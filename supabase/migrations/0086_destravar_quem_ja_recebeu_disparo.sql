-- 0086 — Destrava quem já recebeu disparo e continuou preso na trava
--
-- ## O defeito, relatado e medido
--
-- "Disparamos para a lista de leads, alguns responderam, e a IA não
-- respondeu." Medido em 01/09: **7 clientes responderam ao disparo e só 1
-- das conversas estava marcada como campanha.**
--
-- A isenção da trava olhava a CERTIDÃO DE NASCIMENTO da conversa.
-- `obterOuCriarConversa` devolve a conversa existente intacta, então o
-- `origem: 'campanha'` que o disparador passa só vale no INSERT. Lead que
-- já tinha conversa orgânica recebia o disparo, respondia — e o bot via
-- `origem = 'organica'`, sem palavra-chave, e ficava mudo.
--
-- O código passou a marcar a conversa como atendimento no momento do envio
-- (`marcarConversaComoAtendimento`). Isso vale para o PRÓXIMO disparo. Esta
-- migration acerta os **16** que já receberam e continuam presos.
--
-- ## Por que `cliente_conhecido`, e não `origem`
--
-- Reescrever `origem` apagaria de onde a conversa veio. `cliente_conhecido`
-- significa "sabemos que este número é cliente", e ter disparado para ele a
-- partir da própria lista de leads é a prova. A flag só estava errada
-- porque foi calculada no INSERT, às vezes antes de a pessoa virar lead.
--
-- De quebra acerta o resto: com a flag, a fala do corretor passa a PAUSAR
-- sem retravar, que é o comportamento certo para quem é cliente de verdade.
--
-- ## O recorte
--
-- Só quem NÓS mandamos mensagem: existe item de fila de campanha com
-- `enviado_em` para o lead daquela conversa. Ninguém entra aqui por ter
-- escrito — entra por ter recebido.

update public.whatsapp_conversas c
set cliente_conhecido = true,
    liberado_por_palavra_chave = true
where coalesce(c.cliente_conhecido, false) = false
  and c.liberado_por_palavra_chave = false
  and exists (
    select 1
    from public.whatsapp_campanhas_fila f
    where f.lead_id = c.lead_id
      and f.status in ('enviado', 'respondido')
      and f.enviado_em is not null
  );
