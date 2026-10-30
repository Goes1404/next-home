# App da Astro no iPhone — plano para a App Store

*Escrito em 29/10/2026. Nada aqui foi executado fora do repositório: nenhuma
conta da Apple foi criada, nenhum pacote foi enviado.*

## Onde estamos

| Plataforma | Hoje | Como |
|---|---|---|
| Android | Na Play Store | Trusted Web Activity (`android/`, `twa-manifest.json`), abre `astroimob.vercel.app/corretor` em tela cheia |
| iPhone/iPad | PWA ("Adicionar à Tela de Início") | Metadados do iOS, ícones, telas de abertura e guia de instalação (abaixo) |

O que o PWA do iPhone já tem (29/10/2026):

- `apple-mobile-web-app-capable` + barra de status `black-translucent` + nome
  "Astro CRM" (`src/lib/marcaDoCrm/iphone.ts`, usado em
  `src/app/corretor/layout.tsx`, só no endereço do app);
- ícones 120/152/167/180 e 15 telas de abertura (`apple-touch-startup-image`)
  para iPhones do SE ao 16 Pro Max e iPads, geradas do selo da Astro por
  `node scripts/marca/gerarIconeAstroimob.mjs` (lista em
  `src/lib/marcaDoCrm/telasDeAbertura.json`);
- áreas seguras (`pt-safe`, `pb-safe`) no cabeçalho, nas folhas e na barra do polegar;
- cartão "Instale o app no iPhone" no Início, só no Safari do iOS e fora do app
  (`InstalarNoIphone.tsx`, detecção testada em `iphone.test.ts`);
- avisos (Web Push) — o iOS 16.4+ só entrega push a app da Tela de Início;
- sem internet: agenda de hoje e leads recentes guardados pelo `sw-painel.js`.

**Limites do PWA no iPhone** que justificam (ou não) ir para a App Store:
não aparece na busca da App Store; o cliente precisa saber o caminho do menu
Compartilhar; push só depois de instalado e com permissão pedida dentro do
app; o iOS pode apagar o armazenamento de um PWA pouco usado; sem badge
confiável no ícone em todas as versões.

## Caminhos para a App Store

### A. PWABuilder (pacote iOS)

PWABuilder (pwabuilder.com) lê o manifesto (`/astro.webmanifest`) e gera um
projeto Xcode com um `WKWebView` apontando para o site.

- Prós: horas, não semanas; reaproveita o manifesto e os ícones; o mesmo
  fluxo já usado no Android.
- Contras: é um invólucro de site — exatamente o que a diretriz 4.2 da Apple
  recusa (ver abaixo); push nativo exige mexer no Swift gerado; manutenção
  do projeto gerado fica com a gente.

### B. Capacitor (recomendado)

Capacitor (Ionic) cria o app nativo com `WKWebView` + plugins nativos, e o
conteúdo pode continuar remoto (`server.url = https://astroimob.vercel.app/corretor`)
ou parcialmente empacotado.

- Prós: plugins oficiais para **push nativo (APNs)**, notificações locais,
  câmera/arquivos, compartilhar, biometria, badge; o mesmo projeto serve
  Android se um dia o TWA não bastar; comunidade grande.
- Contras: um projeto a mais (`ios/` + `capacitor.config.ts`), Mac com Xcode
  para compilar (ou CI na nuvem: Codemagic, GitHub Actions com macOS,
  Ionic Appflow), e um registro de dispositivo para push no backend.

**Recomendação:** Capacitor, com conteúdo remoto e uma camada nativa pequena
mas real (push, notificações, biometria, compartilhar), porque é ela que
passa pela 4.2.

## Conta e custos

- **Apple Developer Program: US$ 99/ano** (pessoa física ou empresa).
  Para publicar como "Astro Soluções" é preciso conta de **organização**,
  com **D-U-N-S** da empresa (gratuito, alguns dias a semanas) e um site
  público da empresa.
- Mac com Xcode (ou CI com macOS) para compilar e enviar.
- TestFlight para testar com corretores antes de publicar (incluso).
- Quem cria a conta é o dono da empresa — o código não cria nada fora.

## O risco principal: diretriz 4.2 (Minimum Functionality)

A Apple recusa app que é "só um site embrulhado" (4.2 e 4.2.2). O app de um
SaaS que abre o site num `WKWebView` é o caso clássico de recusa. Como
reduzir o risco:

1. **Push nativo (APNs)** em vez de Web Push: lead novo, cliente que
   respondeu, visita em 1 hora. Plugin `@capacitor/push-notifications`; o
   backend guarda o token do aparelho ao lado de `inscricoes_push` e envia
   pelo APNs (ou FCM com APNs configurado). É a funcionalidade que o revisor
   mais olha.
2. **Notificações locais** de lembrete de visita/tarefa, agendadas no
   aparelho a partir da agenda guardada.
3. **Funcionar sem internet**: a agenda de hoje e os leads recentes já ficam
   guardados (service worker); no app nativo, guardar também no armazenamento
   do app (Preferences/SQLite) e mostrar uma tela nativa sem rede.
4. **Integrações do aparelho**: ligar/WhatsApp com um toque (já existe),
   compartilhar imóvel pela folha nativa (`@capacitor/share`), câmera para
   documentos do cliente, Face ID para reabrir a sessão.
5. **Navegação nativa**: sem barra do Safari, sem links que saem para o
   navegador sem aviso, gesto de voltar, abertura sem tela branca.
6. **Notas para o revisor** (App Review Information): conta de teste
   preenchida (com leads e agenda de exemplo), explicando que é um CRM B2B
   para equipes de venda e listando o que é nativo.

Se mesmo assim for recusado: responder pelo Resolution Center mostrando os
recursos nativos; em último caso, avaliar distribuição **Unlisted** (link
direto, ainda passa por revisão) ou **Apple Business Manager / Custom Apps**
para clientes empresariais.

## Outras regras da Apple que nos afetam

- **3.1.1 / 3.1.3(b) — pagamento:** a assinatura é cobrada fora (Asaas). No
  app do iPhone **não pode** haver botão, preço ou link para assinar/pagar
  (senão a Apple exige compra dentro do app, com taxa). Plano: o app nativo
  manda um marcador (ex.: `AstroApp-iOS` no user agent) e o painel esconde a
  faixa de cobrança e os botões de plano nele. Quem assina faz pelo site.
- **5.1.1(v) — excluir conta dentro do app:** já existe
  `/astro/excluir-conta`; precisa estar acessível a partir do app (menu da conta).
- **Privacidade:** política em `/astro/privacidade`; preencher o "rótulo de
  privacidade" (dados coletados: contato, identificadores, uso) e, se houver
  rastreamento de terceiros no app, o App Tracking Transparency.
- **4.8 — Sign in with Apple:** só obrigatório se houver login por Google,
  Facebook etc. Hoje o login é usuário/e-mail e senha: não se aplica.
- **Universal Links:** `/.well-known/apple-app-site-association` (equivalente
  ao `assetlinks.json` do Android) para links do painel abrirem no app.

## Passo a passo sugerido

1. Criar a conta de organização (dono): D-U-N-S, Apple Developer US$ 99/ano.
2. Projeto Capacitor em `ios-app/` (fora do build do Next), `server.url`
   no endereço do app, ícones/splash deste repositório.
3. Push nativo: registrar token, tabela/coluna para tokens APNs (migration
   própria), envio pelo mesmo ponto que hoje manda Web Push.
4. Marcador do app nativo + esconder cobrança no iOS (3.1.3).
5. Notificações locais da agenda; tela nativa sem rede.
6. `apple-app-site-association` + Universal Links.
7. TestFlight com 3–5 corretores por 1–2 semanas.
8. Envio para revisão com conta de teste e notas ao revisor.

## Estimativa

| Item | Esforço |
|---|---|
| Conta Apple + D-U-N-S | 1–3 semanas de espera (sem desenvolvimento) |
| Capacitor + build + ícones/splash | 2–3 dias |
| Push nativo (app + backend) | 3–5 dias |
| Esconder cobrança, Universal Links, exclusão de conta | 1–2 dias |
| Notificações locais + offline nativo | 2–3 dias |
| TestFlight + ajustes + revisão | 1–3 semanas (revisão costuma levar 1–3 dias por envio) |
