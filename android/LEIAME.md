# App Android da Astro Soluções

O app é um **Trusted Web Activity**: um app Android pequeno que abre
`https://astroimob.vercel.app/corretor` em tela cheia, sem barra do navegador.
Não há código Android para manter; o CRM continua sendo o site.

- Pacote (nunca muda depois de publicado): `com.astrosolucoes.crm`
- Nome na loja: Astro Soluções · nome no ícone: Astro CRM
- Manifesto: `public/astro.webmanifest`
- Vínculo site ↔ app: `/.well-known/assetlinks.json` (rota `src/app/api/assetlinks`,
  lê a variável `ANDROID_SHA256` da Vercel)

> **A chave de assinatura (`astro-upload.keystore`) e a senha dela NUNCA vão
> para o git.** Guarde as duas em dois lugares seguros (gerenciador de senhas
> e um backup). Sem elas não dá para atualizar o app. O `.gitignore` já
> bloqueia `*.keystore`, `*.jks`, `*.aab` e `*.apk` nesta pasta.

## 1. Gerar o arquivo do app (.aab)

No computador (precisa de Node 18+; o Bubblewrap baixa o Java e o Android SDK
sozinho na primeira vez):

```bash
npm i -g @bubblewrap/cli
cd android
bubblewrap init --manifest=https://astroimob.vercel.app/astro.webmanifest
# Responda mantendo os valores de twa-manifest.json; quando perguntar da
# chave, deixe criar "astro-upload.keystore" com o alias "astro-upload".
bubblewrap build
```

Sai `app-release-bundle.aab` (é o que vai para a Play Store) e
`app-release-signed.apk` (para instalar e testar no celular).

Alternativa sem instalar nada: [PWABuilder](https://www.pwabuilder.com) →
endereço `https://astroimob.vercel.app/astro` → Android → mesmo pacote
`com.astrosolucoes.crm`. Ele devolve um .zip com o .aab e a chave: guarde a
chave do mesmo jeito.

## 2. Ligar o site ao app

1. No Play Console, suba o .aab num teste interno e ative a **Assinatura de
   apps do Google Play** (recomendado: se a chave de upload se perder, o
   Google troca).
2. Em Play Console → Configuração → Integridade do app → Assinatura do app,
   copie as duas impressões **SHA-256**: a da chave de assinatura do app (do
   Google) e a da chave de upload.
3. Cole as duas em `IMPRESSOES_DO_APP` (`src/lib/appAndroid.ts`) e publique.
   Já estão lá desde 28/10/2026. (`ANDROID_SHA256` na Vercel substitui a lista,
   se um dia for preciso trocar sem commit.)
4. Confira: `https://astroimob.vercel.app/.well-known/assetlinks.json` deve
   mostrar `com.astrosolucoes.crm` e as duas impressões.
5. Instale pelo teste interno e abra: não pode aparecer barra de endereço.
   Se aparecer, a impressão está errada ou o redeploy não aconteceu.

## 3. Cadastro na loja

| Campo | Valor |
|---|---|
| Política de privacidade | `https://astroimob.vercel.app/astro/privacidade` |
| Exclusão de conta | `https://astroimob.vercel.app/astro/excluir-conta` |
| Termos | `https://astroimob.vercel.app/astro/termos` |
| Site | `https://astroimob.vercel.app` |
| Categoria | Empresa (Business) |
| Público | 18+ · sem anúncios |
| Acesso para revisão | login de demonstração da Imobiliária Exemplo |

## Atualizar o app

Só é preciso gerar outro .aab quando mudar ícone, nome, cor ou pacote. Mudança
no CRM chega sozinha, porque o app abre o site. Para atualizar: suba
`appVersionCode` em `twa-manifest.json` e rode `bubblewrap update` e
`bubblewrap build`.
