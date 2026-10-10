---
title: O atalho da tela inicial guarda o ícone antigo
aliases: [ícone da tela inicial, favicon antigo no celular, manifest, ícone mascarável, apple-touch-icon, adicionar à tela inicial]
tags: [front, armadilha]
type: armadilha
status: evergreen
custou: baixo
codigo:
  - src/app/manifest.ts
  - src/app/manifest.test.ts
  - src/app/layout.tsx
  - scripts/marca/gerarIcones.mjs
  - public/icones/icone-512.png
  - public/icones/icone-mascaravel-512.png
  - public/apple-touch-icon.png
created: 2026-10-09
updated: 2026-10-10
fonte: docs/MEMORIA.md — "O atalho da tela inicial guarda o ícone antigo (09/10/2026)"
summary: Depois da troca do favicon, o atalho do celular seguia com o triângulo do Next borrado. Atalho guarda o ícone de quando foi criado e não atualiza. O site já entregava o ícone novo; faltava um manifesto com ícone de 512 px e versão mascarável, sem start_url e com display "browser".
---

# O atalho da tela inicial guarda o ícone antigo

Relato de 09/10/2026, horas depois de o favicon virar a marca: "o favicon
ainda não está certo", com o print de um atalho "Next Home" mostrando o
triângulo do Next, borrado, dentro de um quadrado branco.

## O que era

- **O site já entregava o ícone novo.** Os arquivos de produção tinham o mesmo
  md5 dos do repositório e mostravam o símbolo da marca.
- **O atalho foi criado quando o favicon ainda era o padrão do Next**, e atalho
  guarda o ícone de quando foi criado. Nem Android nem iPhone o atualizam
  sozinhos. Para trocar, é apagar o atalho e adicionar de novo.
- O borrado é o Android montando o atalho com o favicon pequeno dentro de um
  quadrado branco, porque não havia ícone grande.

## O que mudou para os próximos atalhos

- `src/app/manifest.ts` dá ao celular o ícone de 512 px e uma versão
  **mascarável**: branca até a borda, com o símbolo dentro do círculo de 80%
  que o Android garante mostrar. O celular a recorta no formato dos outros
  ícones (círculo, gota, quadrado).
- `public/apple-touch-icon.png` e `-precomposed.png`: cópias do `apple-icon.png`
  no caminho que alguns navegadores e robôs pedem sem ler o `<head>`. Antes,
  recebiam a página de erro de 32 KB.
- `appleWebApp.title`: o iPhone sugere "Next Home" como nome do atalho, e não
  o título inteiro da página.
- Tudo sai de `node scripts/marca/gerarIcones.mjs`.

## Duas armadilhas do manifesto

- **Sem `start_url`, de propósito.** O Chrome usa o `start_url` como endereço
  do atalho. Com `"/"`, o corretor que põe o painel na tela inicial ganharia um
  atalho para a home do site. Sem ele, vale a página em que a pessoa estava
  (conferido no Chromium: `startUrl` = `/corretor/entrar`).
- **`display: "browser"`, de propósito.** Com `"standalone"`, o Chrome passa a
  oferecer "Instalar app" a todo visitante e o atalho abre sem a barra de
  endereço. Com "browser" o site não é instalável (o Chromium responde
  `manifest-display-not-supported`) e o atalho abre no navegador, como sempre.
- **O Next liga `mobile-web-app-capable` sozinho** quando há `appleWebApp` no
  metadata, mesmo só com `title`. Isso abriria o atalho sem a barra do
  navegador. O layout passa `capable: false`.

`manifest.test.ts` cobra as cinco coisas: display, ausência de start_url,
tamanhos dos ícones, mascarável dentro da zona segura e sem transparência, e
`capable: false` no layout. Cada guarda foi mordida e reprovou.

## Para diagnosticar

Ícone errado na tela inicial: antes de mexer no código, conferir o que o site
entrega (`curl` em `/icon.png`, `/apple-icon.png` e `/manifest.webmanifest`).
Se estiver certo, o atalho é antigo.

## Voltou a aparecer no dia seguinte (10/10/2026)

O mesmo print chegou de novo ("ainda não arrumou o favicon"). Conferido de
novo, e nada no servidor mostra o triângulo:

- `www.nexthomeimoveis.com`, `nexthomeimoveis.com` (redireciona para o www) e
  `next-home-drab.vercel.app` entregam os mesmos arquivos do repositório.
- O site antigo (`nexthomeimobiliaria.com.br`) usa como ícone o próprio
  símbolo da marca, num PNG de 32 px. O triângulo também não vem de lá.

O triângulo só pode vir de três lugares, e nenhum se resolve no código:

1. **O atalho antigo continua na tela.** Nenhum celular troca o ícone de um
   atalho já criado. É preciso apagá-lo e criar outro.
2. **O navegador guardou o ícone antigo.** Se o atalho novo sair com o
   triângulo, apagar os dados do site no navegador (Chrome: Configurações →
   Configurações do site → Todos os sites; iPhone: Ajustes → Safari →
   Avançado → Dados dos Sites) e abrir o site de novo antes de criar o atalho.
3. **O atalho aponta para um endereço de deploy antigo da Vercel**
   (`next-home-…vercel.app` com sufixo). Deploy é imutável: aquele endereço
   serve o favicon padrão do Next para sempre, e recriar o atalho a partir dele
   repete o triângulo. O atalho tem de ser criado a partir de
   `www.nexthomeimoveis.com`.

O Chromium lista `start-url-not-valid` para o nosso manifesto. É esperado,
porque não há `start_url` de propósito, e não impede o atalho.

## Relacionadas
- [[identidade-da-marca-para-o-google]]
- [[MOC — Front Público]]
