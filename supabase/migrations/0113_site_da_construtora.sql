-- 0113 — O importador lembra de onde o imóvel veio (F4 do "importar do site").
--
-- Duas colunas, as duas escritas por caminhos que TOLERAM a coluna ainda não
-- existir: o código subiu antes desta migration ser aplicada, e um insert em
-- `midias` que citasse `origem_url` derrubaria a importação inteira. Por isso
-- nenhuma das duas entra no insert de `registrarMidia` nem no SELECT do
-- catálogo: são gravadas e lidas por consultas à parte, cujo erro vira log.
--
-- `empreendimentos.site_construtora`: a página de onde o cadastro foi lido.
-- É ela que permite o botão "Buscar novidades" sem o corretor colar o link de
-- novo. `empreendimentos` não passou por `revoke update` por coluna, então a
-- coluna herda o grant da tabela (conferir com `has_column_privilege`).
alter table public.empreendimentos add column if not exists site_construtora text;

-- `midias.origem_url`: o endereço da imagem NO SITE, antes de virar cópia no
-- nosso Storage. O dedup por sha256 só descobre que a foto já existe DEPOIS de
-- baixá-la; comparar por origem deixa a tela dizer "já trazida" sem baixar
-- nada, que é o que faz "buscar novidades" mostrar só o que é novo.
alter table public.midias add column if not exists origem_url text;

create index if not exists midias_origem_idx
  on public.midias (empreendimento_id, origem_url)
  where origem_url is not null;
