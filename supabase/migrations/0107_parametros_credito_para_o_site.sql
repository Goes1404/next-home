-- =========================================================================
-- O simulador PÚBLICO precisa dos parâmetros de crédito de verdade
-- =========================================================================
--
-- Achado em 10/09/2026, no log de uma varredura de saúde do site:
--
--   [crédito] falha ao ler parâmetros; usando o padrão do código:
--   permission denied for table parametros_credito
--
-- A 0103 fechou a tabela inteira para `anon` (`revoke all ... from anon`), e
-- na época isso estava certo: quem lia era só o consultor do painel. Depois
-- nasceu `/financiamento`, que é PÚBLICA e roda com a chave publicável — e
-- desde então ela nunca leu uma linha do banco. Cai no padrão do código a
-- cada requisição.
--
-- Hoje o estrago é ZERO porque `PARAMETROS_PADRAO` é cópia fiel do seed. O
-- estrago começa no dia em que o gestor editar as taxas no painel: a tela
-- dele mostra o valor novo, o site público segue mostrando o antigo, e
-- ainda escreve "Taxas e faixas conferidas em <data do seed>" embaixo do
-- resultado. Número de crédito com data que mente é pior que número sem
-- data — e a divergência não apareceria em teste nenhum, só num cliente
-- ouvindo do corretor um valor diferente do que leu no site.
--
-- O que se abre aqui é LEITURA, e só dela:
--
--   * O conteúdo é política pública — faixas do Minha Casa Minha Vida, teto
--     de FGTS, taxa SBPE, alíquota de ITBI por cidade. Nada aqui é privado,
--     nada é de cliente, e tudo isso já é impresso na própria página para
--     quem abrir o site.
--   * A ESCRITA continua onde estava: `atualizar_parametros_credito`,
--     `security definer`, exigindo papel de gestor. `anon` não ganha grant
--     de update, insert ou delete, e a função segue revogada para ele.
--
-- Depois de aplicar: conferir no log do servidor que a linha "[crédito]
-- falha ao ler parâmetros" parou de aparecer ao abrir `/financiamento`. É
-- ela que denuncia o fallback, e ela é o único sinal — a página funciona
-- igual nos dois casos, que é justamente o que torna isto fácil de não ver.
-- =========================================================================

grant select on public.parametros_credito to anon;

-- A RLS está ligada na tabela (0103), então grant sozinho não basta: sem
-- policy, `anon` continua vendo zero linhas — e em silêncio, que é o modo de
-- falhar que este projeto mais repete.
create policy "o site publico le os parametros de credito"
  on public.parametros_credito
  for select
  to anon
  using (true);

comment on policy "o site publico le os parametros de credito" on public.parametros_credito is
  'Leitura pública: são regras de crédito publicadas pelo governo, e a página /financiamento as imprime. A escrita continua só pelo gestor, via atualizar_parametros_credito.';
