-- Põe no funil quem já foi abordado por campanha.
--
-- Até esta data o avanço `novo → primeiro_contato` só acontecia no webhook,
-- ou seja, quando a IA RESPONDIA alguém que escreveu. Quem recebia um
-- disparo e não respondia ficava em "Novo" para sempre, embora já tivesse
-- sido abordado — 10 leads em produção, com mensagem entregue.
--
-- O estrago era duplo e silencioso: a coluna "Novo" do quadro misturava
-- quem nunca foi abordado com quem já recebeu mensagem, e o filtro
-- "parados há 15 dias" voltava a oferecer para a próxima campanha
-- exatamente quem acabou de receber uma.
--
-- O código passou a chamar `avancarLeadParaPrimeiroContato` no disparador;
-- esta migration acerta o passado.
--
-- `etapa = 'novo'` no WHERE é o que torna isto seguro de rodar de novo e o
-- que impede puxar alguém para trás: quem o corretor já moveu para
-- negociação, perdido ou fechado não é tocado. Mesma guarda de termostato
-- do código.
update public.leads l
   set etapa = 'primeiro_contato',
       etapa_alterada_em = coalesce(
         (select max(f.enviado_em)
            from public.whatsapp_campanhas_fila f
           where f.lead_id = l.id and f.status = 'enviado'),
         now()
       )
 where l.etapa = 'novo'
   and exists (
     select 1 from public.whatsapp_campanhas_fila f
      where f.lead_id = l.id and f.status = 'enviado'
   );
