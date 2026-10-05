-- 0160 (05/10/2026): a palavra-chave em produção era "Oii", casada por
-- trecho. Todo "Oii" da corretora a um contato cadastrava o número como
-- lead (origem whatsapp/ativado_pelo_corretor) e ligava a IA. Os 5
-- cadastros feitos assim vão para Arquivados (reversível) e a IA desliga.
-- O código passou a ignorar palavra-chave fora da régua de palavra discreta
-- (`somenteDiscretas`, modoBot.ts), inclusive a já salva.
update public.whatsapp_conversas c
   set bot_ativo = false
  from public.leads l
 where l.id = c.lead_id
   and l.origem = 'whatsapp/ativado_pelo_corretor'
   and l.arquivado_em is null;

update public.leads
   set arquivado_em = now()
 where origem = 'whatsapp/ativado_pelo_corretor'
   and arquivado_em is null;
