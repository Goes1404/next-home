-- 0220: cada imobiliária escolhe como se chamam os grupos de WhatsApp dos
-- corretores, e o gestor pode vincular um grupo à mão (27/10/2026).
--
-- 1. `grupos.padrao_nome_grupo_leads`: o padrão, com `{corretor}` (obrigatório,
--    uma vez) e `{imobiliaria}`. Nulo = o de fábrica, `{corretor} & {imobiliaria}`.
--    A Aretz já usava `NOME & ARETZ`: o padrão dela é gravado aqui, para nada
--    mudar para ela (o nome da casa dela é "Aretz Imobi").
-- 2. `corretores.whatsapp_grupo_leads_manual`: o grupo foi escolhido à mão pelo
--    gestor; "Sincronizar grupos" não mexe nele, e nenhum outro corretor o pega.
--
-- Aditiva: o código antigo não lê nada disto.

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists padrao_nome_grupo_leads text;

alter table public.grupos
  drop constraint if exists grupos_padrao_nome_grupo_leads_check;
alter table public.grupos
  add constraint grupos_padrao_nome_grupo_leads_check check (
    padrao_nome_grupo_leads is null
    or (char_length(padrao_nome_grupo_leads) <= 60 and position('{corretor}' in padrao_nome_grupo_leads) > 0)
  );

comment on column public.grupos.padrao_nome_grupo_leads is
  'Nome dos grupos de WhatsApp dos corretores, com {corretor} e {imobiliaria}; nulo = "{corretor} & {imobiliaria}" (0220).';

alter table public.corretores
  add column if not exists whatsapp_grupo_leads_manual boolean not null default false;

comment on column public.corretores.whatsapp_grupo_leads_manual is
  'O grupo de leads deste corretor foi escolhido à mão pelo gestor; a sincronização não o troca (0220).';

update public.grupos
   set padrao_nome_grupo_leads = '{corretor} & ARETZ'
 where slug = 'aretzimobi'
   and padrao_nome_grupo_leads is null;

commit;
