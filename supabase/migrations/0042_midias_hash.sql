-- Dedup de mídia por conteúdo (ingestão de PDF e de pasta do Drive).
--
-- A construtora manda o MESMO material por dois caminhos: o PDF de
-- apresentação e a pasta do Drive. Sem uma identidade de conteúdo, a foto da
-- fachada entra duas vezes na galeria — e a IA do WhatsApp manda a mesma
-- imagem duas vezes para o cliente.
--
-- O hash é sha256 dos bytes do arquivo, calculado antes do upload. Ele
-- também é o que torna a importação RETOMÁVEL: rodar de novo depois de uma
-- queda não duplica o que já entrou.
--
-- Índice PARCIAL (`where hash_conteudo is not null`) porque as 286 mídias
-- que já existem nasceram de seed e de backfill, sem hash, e nunca serão
-- re-hasheadas — um índice único total recusaria a segunda delas.
--
-- SEM `grant update` de coluna, ao contrário do que `leads` exige: `midias`
-- nunca passou por `revoke update`, então `authenticated` tem update no
-- nível da TABELA e a coluna nova herda o privilégio (conferido em
-- information_schema.column_privileges em 24/08/2026). Escrever um grant
-- por coluna aqui daria a impressão errada de que esta tabela segue o
-- regime restritivo da `leads`.

alter table public.midias add column if not exists hash_conteudo text;

create unique index if not exists midias_dedup_idx
  on public.midias (empreendimento_id, hash_conteudo)
  where hash_conteudo is not null;

comment on column public.midias.hash_conteudo is
  'sha256 dos bytes do arquivo. Dedup entre PDF e Drive, e retomada da importação.';
