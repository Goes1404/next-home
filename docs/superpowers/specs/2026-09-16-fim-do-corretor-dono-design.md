# O fim do corretor dono — o contato do site passa pelo porteiro

> Decisão de produto de 16/09/2026. O pedido veio assim: *"nn deve ter
> corretor dono. remova isso"*, depois de a medição mostrar que 21 dos 25
> imóveis publicados apontavam o botão de WhatsApp para um corretor sem
> número conectado.

## O problema, medido

Cada imóvel tem hoje um `corretor_id`, e é ele que decide para quem vai o
contato do site. Medido em produção em 16/09/2026:

| corretor do cadastro | imóveis publicados | WhatsApp |
|---|---|---|
| Eduardo Cezar | 7 | sem instância |
| Carolini Ivina Maia | 5 | sem instância |
| Cristal - Bruna | 4 | conectado |
| Miro, Renan, Ramos, Graziele, Equipe | 6 | sem instância |

**Vinte e um dos vinte e cinco** mandam o visitante para um número que o
sistema não observa. E um deles pertence a "Equipe Next Home", que foi
desativada em 12/09.

A parte que não é implantação é a REGRA. O link porteiro `/wa/<campanha>`
já resolve isto de outro jeito: ele **filtra** por conexão, porque precisa
devolver um destino que exista. A página do imóvel não filtra nada. São
duas respostas diferentes para a mesma pergunta, e a divergência é
invisível: o WhatsApp abre, o corretor pode até responder pelo celular, e o
CRM não vê nada.

Somado a isso, o porteiro é a ÚNICA forma de mensagem que o webhook aceita
de número desconhecido (regra da 0111, com a fresta aberta em 13/09), e
**nenhum link do site usa o porteiro**. As cinco mensagens que os botões do
imóvel pré-preenchem ("Olá, Bruna! Vim pelo site e quero…") são rejeitadas.

## O que o corretor dono decide hoje

Levantado por leitura de código:

1. O bloco de contato e os botões de WhatsApp da página do imóvel
   (`Hero.tsx`, `Contato.tsx`, `Localizacao.tsx`, `BookDigital.tsx`,
   `SecoesDoImovel.tsx`).
2. O cartão flutuante do mapa (`CardFlutuanteImovel.tsx`).
3. A lista de imóveis na página pública de cada corretor
   (`empreendimentosDoCorretor`).
4. A linha "atua em" e o total de "imóveis acompanhados" na lista de
   corretores (`atuacaoPorCorretor`).
5. O alvo que o link pessoal `?corretor=` substitui: `queries.ts` faz
   `lista.map((e) => ({ ...e, corretor: corretorAtivo }))`.

O que ele **não** decide: segurança. Nenhuma policy de `empreendimentos`
filtra por `corretor_id` — conferido em `pg_policies`. Remover o conceito
não toca em RLS.

## O desenho

### 1. O contato passa pelo porteiro

Os pontos de WhatsApp da página do imóvel deixam de montar `wa.me` a partir
do número do dono e passam a apontar para `/wa/<slug>`, levando a intenção
no endereço (`?i=visita`, `?i=tabela`, `?i=material`, `?i=saber`).

O porteiro compõe a mensagem, sorteia o destino entre quem tem número
conectado e registra o clique, como já faz para o anúncio. Isto conserta as
duas coisas de uma vez: o roteamento passa a considerar conexão, e a
mensagem passa a ser a que o webhook reconhece.

### 1b. Quem aparece no bloco de contato

`Contato.tsx` não mostra só botões: mostra foto, nome e "Corretor
responsável · CRECI" do dono. Sem dono, esse bloco fica sem sujeito, e o
desenho precisa dizer o que entra no lugar.

Decisão: **o rosto passa a ser o do corretor do COOKIE, quando existe, e o
da imobiliária quando não existe.** Quem chegou pelo link pessoal de alguém
continua vendo aquela pessoa, com CRECI e foto; quem chegou pela busca vê a
Next Home. É a mesma regra que o porteiro passa a usar para escolher o
destino, então tela e destino contam a mesma história.

O dado vem de `getCorretorAtivo()`, que já é lido na página por causa do
link pessoal. Nenhuma consulta nova.

Consequência declarada: hoje, sem cookie, nenhum rosto aparece na página do
imóvel. Isso é diferente do que o site mostra agora, e é a mudança visual
mais perceptível desta obra.

### 2. A mensagem preserva a intenção, e o reconhecedor precisa mudar

Hoje `reconhecerMensagemDeAnuncio` trata **tudo** depois do prefixo como o
nome do imóvel, e recusa mensagem acima de 120 caracteres normalizados.

Medido sobre o catálogo real: o nome mais longo tem 58 caracteres, e a pior
combinação de nome mais intenção dá **137** — acima do teto. Emendar a
intenção depois do nome também faria o nome virar "Eternity Alphaville
quero agendar uma visita", que `focoDaConversa` não resolve.

Mudança: o nome passa a ser delimitado pela primeira pontuação de fim de
frase no texto ORIGINAL, e o teto de tamanho passa a valer sobre o NOME,
com 80 caracteres. Fica mais preciso, não menos: hoje o teto protege contra
um texto longo que por acaso comece com o prefixo, e amanhã ele protege
exatamente o pedaço que vira identificação de imóvel.

Forma final da mensagem:

```
Olá! Gostaria de mais informações do <Nome do Imóvel>. <intenção>
```

As intenções são um vocabulário fechado, resolvido no servidor. Valor
desconhecido ou ausente cai no primeiro, que é o texto do anúncio de hoje:

| `?i=` | frase emendada | onde é usado hoje |
|---|---|---|
| ausente | (nenhuma) | anúncio do Meta |
| `saber` | Quero saber mais. | botão do herói |
| `material` | Quero a descrição completa e as plantas. | book digital |
| `tabela` | Quero a tabela de valores e condições. | bloco de contato |
| `visita` | Quero agendar uma visita. | localização e mapa |

O prefixo continua idêntico, então nada do que já funciona para o anúncio
muda de comportamento.

### 3. O porteiro respeita o link pessoal

`sortear_corretor_whatsapp()` ganha um parâmetro opcional de corretor
preferido, com `default null`, para o chamador existente seguir valendo sem
alteração.

**Preferência, nunca filtro.** O conjunto continua sendo o de quem tem
número conectado, porque a função devolve um DESTINO e destino
desconectado não existe. Dentro desse conjunto, o corretor do cookie passa
na frente. Se ele não estiver ali, sorteia normalmente. Tratá-lo como
filtro faria o link pessoal de um corretor desconectado devolver destino
nenhum, que é exatamente o erro que a roleta de leads já cometeu uma vez.

A rota lê o cookie com `getCorretorAtivo()`, que já existe e já é cacheado
por requisição.

### 4. O escape quando ninguém está conectado

Hoje o porteiro degrada para a página do imóvel, e o comentário do arquivo
justifica dizendo que ali há formulário. **Não há**: formulário público só
existe em `/contato` e `/anunciar-imovel`.

Depois desta mudança isso vira defeito de verdade, porque a página do
imóvel passaria a ter só botões que voltam ao porteiro — pingue-pongue. O
escape passa a ser `/contato`, que tem formulário, cria lead por
`/api/leads` e já passa pela roleta.

### 5. As duas páginas públicas

`/corretores/[slug]` deixa de listar "os imóveis dele" e passa a mostrar o
catálogo publicado inteiro. Se ninguém é dono, todo corretor representa
tudo.

Atenção a um engano que quase entrou neste documento: **essa página NÃO
carrega a indicação.** O cookie é gravado por `?corretor=<slug>` em
qualquer página, no `proxy.ts`; abrir `/corretores/<slug>` não grava nada.
O link pessoal que o corretor compartilha continua sendo `/?corretor=<slug>`,
e ele segue funcionando igual.

`/corretores` perde a linha "atua em" de cada cartão: sem posse ela seria
idêntica para todos, e linha igual para todo mundo não informa nada. O
total de "imóveis acompanhados" passa a ser o tamanho do catálogo.

Saem `atuacaoPorCorretor` e `empreendimentosDoCorretor` de
`lib/catalogo/cache.ts`, e os dois embrulhos em `lib/queries.ts`.

### 6. A ordem do deploy, que não pode inverter

`SELECT_EMPREENDIMENTO` traz `corretor:corretores!empreendimentos_corretor_id_fkey(...)`.
Esse embed quebra no instante em que a chave estrangeira deixa de existir.

Portanto: **primeiro o código, depois a migration.**

1. Deploy 1 — sai o embed de `selects.ts` e `queries.ts`, sai `corretor` do
   tipo `Empreendimento`, saem os leitores, entram os links do porteiro.
2. Confirmar em produção que o catálogo responde (sonda `/api/versao` mais
   as rotas públicas).
3. Deploy 2 — migration com `alter table empreendimentos drop column
   corretor_id`.

Invertido, a produção em execução consulta uma relação que não existe mais
e todo o catálogo cai de uma vez.

**A coluna é dropada, não renomeada.** Levantei que renomear para
`cadastrado_por` preservaria o histórico de quem cadastrou cada imóvel a
custo zero; a decisão foi dropar, reafirmada depois da ressalva. O registro
de quem cadastrou os 26 imóveis não volta.

## Testes e guardas

- **O compilador é a primeira guarda.** Tirar `corretor` de
  `Empreendimento` faz o `tsc` apontar todos os leitores, um a um. Nenhum
  fica para trás por esquecimento de `grep`.
- **Reconhecedor**: nome delimitado por ponto; intenção emendada continua
  sendo reconhecida; nome acima de 80 caracteres é recusado; a mensagem do
  anúncio antiga, sem intenção, segue reconhecida igual.
- **Porteiro**: com cookie de corretor conectado, manda para ele; com
  cookie de corretor desconectado, sorteia; sem ninguém conectado, degrada
  para `/contato`.
- **Guarda de código-fonte**: nenhum componente público monta `wa.me` a
  partir de um imóvel. A regressão seria calada — o botão funcionaria, a
  conversa abriria, e só o CRM não veria nada. Provocada antes de valer,
  com md5 conferindo que a mordida mordeu.

### 7. A porta geral, para o resto do site

> Puxado para dentro do escopo em 16/09, a pedido ("faça tudo então"),
> depois de ter sido declarado fora.

`CtaFinal.tsx` (home), `Footer.tsx`, `WhatsappCta.tsx` (botão flutuante) e
`CardCorretor.tsx` também montam `wa.me` com mensagens que o porteiro
rejeita ("Olá, Bruna! Vim pelo site da Next Home e quero falar com você.").
Eles não derivam do corretor dono, mas depois desta obra seriam os ÚNICOS
caminhos do site que não chegam ao CRM.

O problema novo é que o porteiro é chaveado por IMÓVEL, e esses pontos não
têm imóvel nenhum. O reconhecedor, por sua vez, exige o nome de um imóvel
depois do prefixo.

**A porta geral é `/wa` sem imóvel**, e ela obriga uma segunda forma de
reconhecimento:

```
Olá! Vim pelo site da Next Home.
```

Essa frase é reconhecida por CÓDIGO, como constante, não por
`palavras_entrada_cliente`. A razão é dependência: a configuração é por
corretor e hoje só uma instância a tem preenchida. Fazer o funil do site
depender de um campo que cada corretor preenche à mão é construir o mesmo
silêncio que a 0111 causou — funciona para quem configurou e morre calado
para o resto. A mensagem é NOSSA, então reconhecê-la é decisão de código.

O convite resultante tem `imovel: null`, que o contrato de
`ConviteDeEntrada` já prevê: quem resolve o imóvel a partir da conversa é
`focoDaConversa`, na mensagem seguinte.

**O cartão de corretor ganha destino preferido.** `CardCorretor.tsx` é o
único ponto em que o visitante ESCOLHE uma pessoa, então o link vira
`/wa?c=<slug>`: o porteiro prefere aquele corretor, e cai no sorteio se ele
não estiver conectado. O clique também grava o cookie de atribuição, para a
escolha valer nas próximas páginas.

Depois desta seção, **nenhum ponto do site monta `wa.me` diretamente**, e é
isso que a guarda de código-fonte passa a exigir.

## Fora de escopo, declarado

Nada do site fica de fora. O que continua montando `wa.me` por conta
própria é o PAINEL (`whatsapp/acoes.ts`, Live Chat, disparo), e ali é
correto: quem manda é o corretor logado, pelo próprio número, para um
cliente que já é lead. A guarda de código-fonte recorta só o site
público.

## Riscos

- **Dropar a coluna é irreversível.** Mitigado apenas pela ordem em dois
  deploys, que protege a disponibilidade, não o dado.
- **O escape para `/contato` muda o que o visitante recebe** quando
  nenhum corretor está conectado, que é o estado de hoje para 6 dos 7.
  Enquanto só a Bruna tiver número no ar, todo contato do site vai para
  ela ou para o formulário.
- **A página do corretor deixa de ser carteira pessoal.** Se um dia a
  empresa voltar a querer posse por imóvel, a coluna terá de ser recriada
  e repovoada à mão.
