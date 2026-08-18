-- Migration 0020: Book Digital Completo para Empreendimentos (PDF)
-- Adiciona suporte para upload e exibição de books e apresentações completas de empreendimentos

alter table public.empreendimentos
  add column if not exists book_url text,
  add column if not exists book_titulo text;

comment on column public.empreendimentos.book_url is 'URL pública do PDF ou apresentação do Book completo do empreendimento';
comment on column public.empreendimentos.book_titulo is 'Título amigável do Book (ex: Book Oficial de Lançamento 2026)';
