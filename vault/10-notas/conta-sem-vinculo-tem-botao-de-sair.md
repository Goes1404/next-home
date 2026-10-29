---
title: Conta sem vínculo tem botão de sair
aliases: [Conta ainda não vinculada, ContaSemVinculo, preso na tela de vínculo]
tags: [painel, armadilha]
type: armadilha
status: evergreen
custou: baixo
codigo:
  - src/app/corretor/(painel)/layout.tsx
  - src/app/corretor/(painel)/contaSemVinculo.test.ts
created: 2026-10-29
updated: 2026-10-29
fonte: print do celular do dono ("Atualmente não é possível sair dessa tela"), 29/10/2026
summary: Login sem cadastro de corretor caía em "Conta ainda não vinculada" sem nenhum "Sair", porque o menu da conta só existe quando há corretor; o cartão ganhou o próprio botão de sair, e o administrador da plataforma sem corretor (o dono) é mandado para /plataforma em vez de cair ali.
---
# Conta sem vínculo tem botão de sair

Quando o login autentica mas nenhuma linha de `corretores` aponta para ele
(ou aponta sem `slug`), o layout do painel troca as telas pelo cartão
`ContaSemVinculo`. O "Sair" mora no `MenuDaConta`, que só é desenhado com
`corretor`. Resultado: a pessoa ficava presa, sem como entrar com outro login
(só apagando os cookies do navegador).

O cartão agora tem o formulário `action={sair}` ("Sair e entrar com outra
conta"), e `contaSemVinculo.test.ts` reprova se ele sumir.

Quem caiu ali no print era o **dono**, administrador da plataforma sem ficha
de corretor (por desenho). O login já o mandava para `/plataforma`
(`entrar` em `actions.ts`), mas o app Android e os atalhos abrem `/corretor`
direto. O layout do painel agora consulta `eh_admin_da_plataforma()` pela
sessão quando não há corretor e redireciona para `/plataforma`.

## Para lembrar

- Toda tela que substitui o painel inteiro (termos, conta sem vínculo) precisa
  do próprio "Sair": o menu da conta depende do corretor carregado.
- Chegar nessa tela quer dizer login sem corretor: o vínculo se resolve no
  cadastro (`corretores.user_id` e `slug`), não no código.

Ligações: [[icone-e-manifesto-por-grupo]].
