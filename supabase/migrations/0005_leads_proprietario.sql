-- Captação de proprietário (/anunciar-imovel).
--
-- Até aqui `leads` só guardava um funil: quem quer COMPRAR. A página de
-- anunciar traz o outro lado do negócio — quem TEM um imóvel e quer vender ou
-- alugar pela Next Home. São dois funis com tratamento comercial diferente, e
-- misturá-los numa tabela sem distinção deixaria o corretor sem saber quem
-- ligar primeiro.
--
-- `detalhes` (jsonb) guarda os campos específicos do imóvel ofertado (tipo,
-- cidade/bairro, intenção). Vão em jsonb, e não em colunas próprias, porque
-- só um dos dois formulários os preenche — como colunas seriam meia dúzia de
-- campos nulos em todo lead de comprador.

alter table leads
  add column tipo text not null default 'comprador'
    check (tipo in ('comprador', 'proprietario')),
  add column detalhes jsonb;

-- Sem mudança de RLS: a policy "qualquer um pode enviar um lead" (insert
-- público, 0001_init.sql) já cobre os dois tipos, e a leitura continua
-- reservada ao service role.
