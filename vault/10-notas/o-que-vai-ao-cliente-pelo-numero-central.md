---
title: O que vai ao cliente pelo número central
aliases: [mandar_material, selecao_ou_proposta, meu_link_e_mensagens, envioAoClientePeloCentral, frente N]
tags: [crm, anti-ban, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/tratadores/cliente.ts
  - src/lib/crm/envioAoClientePeloCentral.ts
  - src/lib/crm/documentoPeloCentral.ts
  - src/lib/crm/gravarLinkDoCliente.ts
  - src/lib/imovelPublico/linkPessoal.ts
  - src/app/corretor/(painel)/links/page.tsx
  - src/app/corretor/(painel)/leads/[id]/linksAcoes.ts
fonte: onda 3 do número central, Frente N (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: Material do imóvel, seleção, proposta e mensagem pronta saem pelo número do PRÓPRIO corretor, só depois do "sim", por um ponto só (envioAoClientePeloCentral) — só para lead dele, nunca primeiro contato (o cliente precisa ter falado com aquele número), cota do número quando é iniciativa nossa, nunca para quem pediu para sair. Nada de texto ditado: o que sai é montado por código das peças do painel. Proposta só a que o corretor montou na ficha.
---
# O que vai ao cliente pelo número central

Capacidades 17, 31 e 33 da spec (3.5, 3.7). Onda 3; com `ONDA_ATUAL`
abaixo de 3 nada disto roda.

## Um ponto só de envio: `crm/envioAoClientePeloCentral.ts`

Tudo que vai ao cliente passa por `enviarAoClientePeloCentral`, que confere
de novo no "sim" (o `preparar` confere antes, só lendo, com
`podeFalarComOCliente`):

- **lead do corretor que pede** (`leadDoDono`): o gestor NÃO manda pelo
  número de outro corretor, nem forjando os `dados`;
- **pediu para sair** (`nao_contatar_em`) e conversa que o número não fala
  mais (lead que passou a outro número): recusa;
- **número desconectado ou em pausa de proteção**: recusa clara
  (`canalComOCliente`, o mesmo do link de documentos da Frente I, que ganhou
  a frase de "sem conversa" de quem chama e o `conectado_em`);
- **primeiro contato não sai pelo central**: a régua é haver FALA DO CLIENTE
  na conversa com este número, não a linha da conversa (lista que ninguém
  respondeu ainda é primeiro contato — [[primeiro-contato-tem-teto-proprio]]).
  Vai pelo painel ou pela lista, com o teto de 10/30 e o aquecimento;
- **cota**: cliente esperando resposta (última fala é dele) = resposta, sem
  cota; senão é iniciativa nossa e passa por `reservarCotaCampanha` (cota do
  dia + espaçamento), como o botão ✨ (`gerarEEnviarPelaIA`). Horário não
  barra (pedido do corretor, como mensagem manual). Sem cota, nada sai e a
  resposta diz o motivo.

O texto sai antes das mídias; mídia com pausa de 1,5–3 s e nota
`📎 título: url` (a IA não reenvia). Falha numa mídia para as seguintes.
`registrarInteracao` na ficha. Não desliga a IA da conversa (igual ao link de
documentos; o anexo do chat do painel desliga — divergência consciente).

**Armadilha de teste**: os valores padrão de `DependenciasDoEnvio` são
EMBRULHADOS (`(p) => enviarMensagemWhatsapp(p)`). O índice dos tratadores
carrega este arquivo em todo teste do central, e `agenda.test.ts` finge o
repositório sem `reservarCotaCampanha`: ler a exportação na carga do módulo
quebrava a suíte inteira dele.

## Nada de recado livre (spec 6.1)

O cérebro só ESCOLHE; o texto é montado por código:

- material: "book", "apresentação", "material" = o **link pessoal** da página
  do imóvel com a mensagem do botão "Copiar mensagem" da tela Links (regra 17
  da IA de atendimento: apresentação é o link, não foto); "fotos"/"planta" =
  mídias do catálogo do grupo (teto `MAXIMO_ANEXOS` = 3); vídeo/tour recusa;
  fala que não é nenhum desses é recado e recusa;
- mensagem pronta: casa pelo TÍTULO do modelo do corretor (nunca pelo
  conteúdo), preenchida como a lista (`preencherTemplate` + `trocarNome`); campo
  que só a lista preenche (`{imovel}`, `{bairro}`) recusa em vez de sair cru;
- seleção e proposta: `mensagemParaCliente`, a mesma da ficha.

## Seleção, proposta e link pessoal

- **Seleção**: nomes ("Royal e Vitta") por `acharImovel` de `imoveis.ts`;
  contagem ("3 imóveis", "o Vitta e mais 2") completa com `imoveisQueCombinam`,
  a régua de "quais imóveis pro João?". Pediu 3 e só 2 combinam: o resumo diz.
  Grava por `gravarLinkDoCliente` (saiu de `linksAcoes.ts`; o painel delega),
  com código curto da vitrine. Falhou o envio → a página é desativada.
  **Desfazer** = `desativarLinkNaoAberto` (expira agora, só se `aberto_em` é
  nulo); vista, fica. A mensagem enviada não volta, e o texto diz.
- **Proposta**: valor e condição são escritos pelo CORRETOR, nunca pela IA
  (`crm/proposta.ts`), e a ferramenta não tem esses campos
  (`additionalProperties: false`). O central manda a proposta ABERTA que ele
  montou na ficha; sem ela, aponta Links do cliente → Proposta. Pendência:
  criar pelo central exige `valor`, `condicao` e `validade` na declaração.
- **Meu link**: `linkPessoal.ts` é a montagem única (tela Links e central):
  com site, `/empreendimentos/<slug>?corretor=`; sem site, a ficha pública com
  `?c=`; sem imóvel, o portfólio. Responde direto (`preparar` → `resposta`),
  sem mandar a ninguém. "Manda meu link do Vitta pro João" vira a
  apresentação do material, com as mesmas travas.

## Relacionadas
- [[documentos-lembrete-e-planilha-pelo-central]]
- [[central-imoveis-do-catalogo]]
- [[primeiro-contato-tem-teto-proprio]]
- [[crm-pelo-whatsapp-numero-central-com-ia]]
- [[MOC — IA e Atendimento]]
