-- A roleta de leads (`distribuir_lead`, 0007) só olhava CARGA, e por isso
-- empurrava o lead para longe de quem consegue atendê-lo.
--
-- Medido em 03/09/2026: dos 9 leads distribuídos pela roleta, 8 foram para 6
-- corretores que NÃO têm login no painel nem WhatsApp conectado. A única
-- pessoa que hoje atende — login, número no ar, 107 leads — recebeu 1. O
-- critério de carga, sozinho, faz exatamente isso: quanto mais alguém
-- trabalha, menos lead ele recebe, até o lead ir parar com quem não pode
-- abrir a tela para vê-lo.
--
-- Lead parado com quem não consegue agir é o mesmo estrago de lead sem dono,
-- só que mais difícil de notar: ele aparece atribuído, e ninguém procura.
--
-- Três correções, todas na ORDEM. Nada vira filtro novo: filtro devolve
-- `alvo` nulo e o lead nasce órfão, que é pior que mal distribuído.
--
--   1. Quem tem WhatsApp no ar primeiro — é por ele que o contato acontece.
--   2. Quem tem login no painel — é onde o lead é visto.
--   3. A carga passa a contar só lead EM ANDAMENTO — nem arquivado, nem
--      `perdido`, nem `fechado`. Carteira morta não dá trabalho a ninguém, e
--      contá-la faz a roleta evitar quem está livre. Isso não é hipótese:
--      54 dos 107 leads da Bruna na janela de 30 dias estão em `perdido`,
--      da limpeza de 27/08 que marcou sem arquivar. Metade da "carga" dela
--      é trabalho que não existe — e é justamente no dia em que o segundo
--      corretor entrar que esse número decide para onde vai todo lead novo.
--
-- E o `slug is not null` deixa de ser filtro e vira preferência, pelo mesmo
-- motivo dos outros: hoje ele barra "Equipe Next Home", e num cenário em que
-- ninguém tivesse slug a roleta pararia de distribuir em silêncio.

create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  alvo uuid;
  cidade_lead text;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
    left join corretor_whatsapp_instancias i
      on i.corretor_id = c.id
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
   where c.ativo
     and not c.em_pausa
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     -- 1. Tem o número no ar: é por ele que o contato acontece.
     (i.corretor_id is null),
     -- 2. Consegue abrir o painel para ver o lead.
     (c.user_id is null),
     -- 3. Tem link pessoal (era filtro até a 0093).
     (c.slug is null),
     -- 4. Menos carregado nos últimos 30 dias, contando só lead EM
     --    ANDAMENTO: `perdido` e `fechado` não pedem mais nada de ninguém.
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.arquivado_em is null
         and l.etapa not in ('perdido', 'fechado')
         and l.created_at > now() - interval '30 days') asc,
     -- 5. Desempate: quem faz mais tempo que não recebe.
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc,
     random()
   limit 1;

  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$function$;

-- Desfaz a primeira tentativa desta mesma sessão: uma função de sorteio
-- chamada pelo webhook seria uma SEGUNDA régua de "quem recebe o próximo
-- lead", competindo com o trigger. Duas contas do mesmo número divergem, e
-- esta decide carteira de gente.
drop function if exists public.sortear_corretor_para_lead();
