-- 0101 — A arte de IA passa a saber de que imóvel ela é (06/09/2026).
--
-- Spec: docs/superpowers/specs/2026-09-06-arte-de-ia-no-cadastro-design.md
--
-- ## O problema
--
-- `imagens_geradas` já gravava o imóvel, mas DENTRO do jsonb `briefing`
-- (`imovelSlug`, `imovelNome`) e só no modo "arte" do estúdio. Texto solto
-- em jsonb não é vínculo: não tem integridade referencial, o slug muda
-- quando o imóvel é renomeado, e não dá para perguntar ao banco "quais
-- artes são deste imóvel?" sem varrer a tabela inteira. O `briefing`
-- continua onde está — ele é o REGISTRO do pedido, não o vínculo.
--
-- ## Por que não vira `midias`
--
-- Decisão mantida de 03/09 e reconfirmada pelo usuário em 06/09: arte de IA
-- NÃO entra em `midias`. `midias` é o catálogo — é o que a vitrine pública
-- mostra e a ÚNICA fonte de anexo que a assistente pode mandar para um
-- cliente (o guardrail do atendimento). Uma fachada inventada por modelo
-- chegando no WhatsApp de quem vai visitar o imóvel é exatamente o defeito
-- que a MEMORIA registra desde agosto: o cliente confere na visita.
--
-- Então a arte fica visível para o CORRETOR, ligada ao imóvel, e para de
-- viver solta numa galeria onde ninguém lembra de que empreendimento era.
--
-- ## `on delete set null`, não cascade
--
-- Excluir um imóvel não apaga a imagem: ela já foi paga (geração é a única
-- coisa do painel que custa por clique) e continua servindo de peça de
-- marketing. Perde o vínculo, volta a ser uma arte da galeria — que é o que
-- toda arte era antes desta migration.

alter table public.imagens_geradas
  add column empreendimento_id uuid
    references public.empreendimentos(id) on delete set null;

comment on column public.imagens_geradas.empreendimento_id is
  'Imóvel a que esta arte pertence. NÃO é mídia do catálogo: não aparece na '
  'vitrine e a assistente não pode enviá-la. Nulo = arte avulsa da galeria.';

-- O editor e o cartão do catálogo perguntam "as artes DESTE imóvel, da mais
-- nova para a mais velha". Sem o índice, isso é varredura da tabela inteira
-- a cada abertura de editor.
create index imagens_geradas_empreendimento_idx
  on public.imagens_geradas (empreendimento_id, created_at desc)
  where empreendimento_id is not null;

-- As policies da 0090 continuam valendo sem mudança: leitura e exclusão são
-- recortadas por `corretor_id`, e a coluna nova não afeta esse recorte. Uma
-- arte vinculada a imóvel de outro corretor continua invisível para ele.
