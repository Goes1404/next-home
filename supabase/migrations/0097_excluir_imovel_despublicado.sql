-- Excluir imóvel: a policy que faltava, e o degrau que a torna segura.
--
-- Relatado em 04/09/2026: "não é possível excluir um imóvel". Estava certo, e
-- por DOIS motivos empilhados — não havia caminho na tela E não havia policy.
-- O grant de DELETE para `authenticated` existe desde sempre (é o default do
-- Supabase, que a varredura da 0082 deixou de pé aqui); sem policy, com RLS
-- ligada, todo delete afeta ZERO linhas em silêncio. É a mesma armadilha da
-- 0055, quando `leads` ganhou exclusão: policy e grant são coisas diferentes,
-- e faltar um dos dois falha calado.
--
-- ## Só o que está DESPUBLICADO
--
-- A regra de dois passos de `leads` (arquivar antes de excluir) aqui já tem
-- um estado equivalente e melhor: `publicado`. Despublicar tira o imóvel da
-- vitrine na hora e é reversível; excluir não é. Exigir isso na POLICY, e não
-- em JavaScript, evita a corrida de sempre — entre conferir e apagar, outra
-- aba pode ter republicado.
--
-- E o estrago é grande, o que justifica o degrau: apagar leva por CASCADE as
-- `midias`, `tipologias`, `empreendimento_lazer`, `historico_precos_itens` e
-- os destaques dos corretores. Lead, clique, campanha e vídeo ficam órfãos
-- (SET NULL), preservando o histórico do atendimento — que é o certo: a
-- conversa aconteceu, mesmo que o imóvel saia do catálogo.
--
-- Quem apaga os ARQUIVOS do bucket é a action, antes de apagar a linha: as
-- linhas de `midias` somem por cascade e levam junto as URLs, então depois
-- não há como saber o que remover. Foi o alerta da 0046 ("arquivo órfão no
-- bucket, de forma irreversível") que fez a 0046 despublicar em vez de apagar.

create policy "corretor exclui imovel despublicado"
  on public.empreendimentos
  for delete
  to authenticated
  using (
    publicado = false
    and exists (select 1 from public.corretores c where c.user_id = auth.uid())
  );
