# Arte de IA no cadastro do imóvel — design

**Data:** 06/09/2026
**Migration:** `0101_arte_de_ia_por_imovel.sql`
**Pedido:** "quando a pessoa estiver em catálogo e for criar um imóvel, faça
uma opção na tela de cadastro para criar uma imagem com a IA, e aí a pessoa
especifica o que precisa na imagem, e junte com as informações que ela
colocou. E com isso atrele ao card registrado do imóvel criado."

## O problema

O painel já gera imagem — `/corretor/imoveis/criar-imagem`, rota
`/api/imagens/gerar`, tabela `imagens_geradas`. Duas coisas faltavam:

1. **O momento.** A tela de criar arte é outra tela, em outra seção. O
   corretor que acabou de cadastrar um imóvel — que é justamente o imóvel SEM
   foto nenhuma — teria de sair, achar o estúdio e redigitar bairro, cidade e
   estágio da obra, dados que ele preencheu um minuto antes.
2. **O vínculo.** `imagens_geradas` gravava o imóvel dentro do jsonb
   `briefing` (`imovelSlug`, `imovelNome`), e só no modo "arte". Texto solto
   em jsonb não é vínculo: sem integridade referencial, o slug muda quando o
   imóvel é renomeado, e não dá para perguntar ao banco "quais artes são
   deste imóvel" sem varrer a tabela.

## A decisão que governa o resto: arte de IA NÃO é mídia do catálogo

`midias` é o catálogo. É o que a vitrine pública mostra e a **única** fonte de
anexo que a assistente pode mandar para um cliente — o guardrail do
atendimento. Um render de fachada inventado por modelo chegando no WhatsApp
de quem vai visitar o imóvel na semana seguinte é o defeito que a MEMORIA
registra desde agosto: **quem visita confere.**

Confirmado com o usuário em 06/09 entre três opções (vinculada fora da
vitrine / virar foto / virar foto por promoção manual). Escolha: **vinculada,
fora da vitrine.**

Consequências:

- A arte fica visível para o corretor, ligada ao imóvel.
- Não entra em `midias`, não vai ao site, a assistente não envia.
- No cartão do catálogo ela pode servir de capa **interna**, sempre com selo
  "arte de IA · não é foto". O catálogo do painel é tela de trabalho; a
  vitrine continua dizendo que o imóvel não tem foto.

## As peças

### 1. `0101_arte_de_ia_por_imovel.sql`

Coluna `empreendimento_id uuid references empreendimentos(id) on delete set
null` em `imagens_geradas`, mais índice parcial
`(empreendimento_id, created_at desc) where empreendimento_id is not null`.

`set null` e não `cascade`: excluir um imóvel não apaga a imagem. Ela já foi
paga — geração é a única coisa do painel que custa por clique — e volta a ser
uma arte avulsa da galeria, que é o que toda arte era antes.

As policies da 0090 não mudam: leitura e exclusão continuam recortadas por
`corretor_id`, então arte de imóvel de outro corretor segue invisível.

### 2. `src/lib/imagens/pedidoDoCadastro.ts` — módulo PURO

`pedidoDeImagemDoCadastro({ pedido, nome, bairro, cidade, construtora,
status, tipo })` devolve o texto que vai ao modelo:

```
<o que o corretor escreveu>. Contexto do imóvel: <Tipo> chamado "<Nome>" em
<Bairro>, <Cidade> no estágio "<Estágio>" [da construtora <X>].
[Perspectiva ilustrativa de obra não entregue.] Sem pessoas com rosto
reconhecível. Sem texto, logotipo ou marca d'água na imagem.
```

Três regras dentro dele:

- **Rótulo humano, nunca o enum.** `em_construcao` cru já fez o modelo
  afirmar ao cliente que o imóvel estava "pronto para morar". Entra
  `STATUS_LABEL`/`TIPO_LABEL` — as mesmas palavras da tela.
- **Ressalvas por código, no fim.** Mesma razão de `restricoesDuras` no
  estúdio: instrução escrita à mão some quando alguém edita o texto. E o que
  vem por último num prompt de imagem é lido como ajuste, não como tema — a
  ordem que `montarPedido` já usa.
- **Sem pedido, sem imagem.** Devolve `""`; montar contexto em volta do vazio
  produziria uma foto de catálogo aleatória.

É puro e sem `server-only` porque o formulário (`"use client"`) mostra o
pedido montado ANTES de gerar, e a rota monta o mesmo texto. Duas montagens
divergiriam, e o corretor aprovaria um texto e pagaria por outro.

### 3. Rota `/api/imagens/gerar`

Passa a resolver `imovelSlug` também no modo livre e a gravar
`empreendimentoId`. A resolução usa `getEmpreendimentoDoPainel`, que é o
cliente COM sessão — a RLS decide o que ele pode apontar. Slug de imóvel
alheio volta nulo e a imagem nasce avulsa; não vaza nada e não falha.

### 4. `galeria.ts`

- `registrarImagem` aceita `empreendimentoId`.
- `getArtesDoImovel(id)` — o bloco do editor.
- `getArtePorImovel(ids)` — uma consulta para a grade inteira do catálogo, não
  uma por cartão. N+1 numa grade é como uma tela fica lenta sem que nenhuma
  consulta pareça cara.

Assimetria deliberada no tratamento de erro: `getArtesDoImovel` lança (é a
tela; erro não pode se disfarçar de "você não criou nada"), `getArtePorImovel`
devolve mapa vazio (é ILUSTRAÇÃO de cartão; derrubar a lista de imóveis por
causa da miniatura trocaria o essencial pelo enfeite).

### 5. `FormNovoImovel` — a ordem importa

Bloco opcional com caixa de seleção, escolha de receita (só as que **não**
precisam de foto — o imóvel está nascendo, não há referência) e o texto
livre. Um `<details>` mostra o pedido completo antes de gerar: geração custa
por clique, e quem paga tem direito de ver o que compra.

No envio: **cria o imóvel, depois a arte.** Se a geração falhar (sem crédito,
tempo esgotado, teto do dia), o imóvel já está criado e a tela oferece o link
para o editor — não um botão de tentar de novo, que criaria um segundo
cadastro. O botão diz em que passo está, porque o segundo demora 15-40s e
botão parado nesse tempo parece travado: o corretor clica de novo e paga
duas vezes.

### 6. Onde a arte aparece

- `ArtesDeIA` no editor do imóvel, com a ressalva escrita na tela. Some
  quando não há arte.
- Capa do cartão no catálogo interno, **só** para imóvel sem foto, com selo.

## Defeito encontrado no caminho

`mapEmpreendimento` devolve `capa: fotos[0] ?? CAPA_PADRAO`, e `CAPA_PADRAO` é
o logotipo da NextHome. Ou seja: `imovel.capa?.url` NUNCA é falso, o ramo
"Sem Foto de Capa" do cartão era código morto, e imóvel sem foto aparecia com
o logotipo esticado em `object-cover`. Quem responde "tem foto?" é
`galeria.length`, e é isso que o cartão passou a usar.

## O que este design NÃO faz

- Não promove arte para `midias` (nem com botão). Se um dia for preciso, o
  desenho já suporta: a coluna existe e a promoção seria uma ação explícita.
- Não gera em segundo plano. `high` não cabe nos 60s do plano Hobby e
  `medium`/`low` cabem; trabalho assíncrono não se constrói antes de alguém
  precisar.
- Não mexe no estúdio (`/corretor/imoveis/criar-imagem`), que ganha o vínculo
  de graça por usar a mesma rota.
