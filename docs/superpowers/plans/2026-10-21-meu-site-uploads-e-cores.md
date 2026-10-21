# Meu site — envio de imagem que funciona para leigo, e controle das cores (21/10/2026)

Relato do dono depois de testar "Meu site" (tela `/corretor/admin/site`):
"os botões de adicionar logo e adicionar imagem não estão funcionando" e
"quero mais controle nas cores: fundo, letras, cor principal e secundária".

## 1. Envio de logo e capa

Diagnóstico: testado por automação, o envio FUNCIONA (escolher arquivo no
`input type=file` e depois clicar em "Enviar a capa"). O defeito é de uso:
o campo nativo do navegador ("Escolher arquivo") fica escondido/feio e a
pessoa escolhe a imagem e espera que ela suba — mas é preciso um segundo
clique num botão. Foto de celular também costuma passar de 5 MB ou vir em
HEIC.

Corrigir em `src/app/corretor/(painel)/admin/site/FormularioDeCapa.tsx` e
`src/components/grupos/FormularioDeLogo.tsx` (usado também na plataforma):
- Um botão grande e claro ("Escolher imagem" / "Trocar imagem") que abre o
  seletor; **ao escolher, envia na hora** (sem segundo clique), com estado
  "Enviando…" e prévia imediata (`URL.createObjectURL`).
- Arrastar e soltar a imagem na área da prévia também envia.
- Imagem grande: reduzir NO NAVEGADOR antes de enviar (canvas, lado maior
  2400 px para a capa e 800 px para a logo, JPEG/WebP qualidade ~0,85),
  para caber no limite e passar no teto de corpo da Vercel (4,5 MB). Logo
  em PNG com transparência continua PNG (só reduz se passar do limite).
- HEIC/HEIF: mensagem clara ("o iPhone salva em HEIC; tire um print ou
  exporte como JPG") quando o navegador não conseguir abrir.
- Toda mensagem de erro do servidor aparece; erro de rede diz o que fazer.
- Mesma correção vale para o upload de logo na plataforma
  (`/plataforma/grupos/[id]`).

## 2. Cores do site

Hoje há só `grupos.site_cor` (cor principal). Acrescentar
(`supabase/migrations/0210_cores_do_site.sql`, padrão da 0209, CHECK de hex
`^#[0-9a-f]{6}$`, sem grant novo):
`site_cor_secundaria`, `site_cor_fundo`, `site_cor_texto`.

- **Principal:** botões, links, destaques (o que hoje usa o acento). Corrigir
  também os lugares do site do grupo que ainda saem no verde padrão (ex.:
  botão "Buscar imóveis" do herói): procure classes de cor fixa da marca
  (teal/brand) nos componentes do site e troque pela variável do acento
  quando o site não for o da Next Home — **sem mudar o site da Next Home**.
- **Secundária:** etiquetas, selos de estágio, detalhes e o segundo tom dos
  degradês.
- **Fundo:** a cor de fundo das páginas do site do grupo.
- **Texto:** a cor do texto principal; títulos acompanham.
- Cada cor tem seletor (input color + campo hex) e uma **prévia ao vivo**
  na própria tela (um mini cabeçalho, um card de imóvel e um botão com as
  cores escolhidas).
- **Contraste:** calcular WCAG entre texto e fundo, e entre o texto do botão
  e a cor principal; abaixo de 4,5:1 mostrar aviso claro e oferecer
  "ajustar automaticamente" (escurece/clareia o texto). Não bloquear salvar,
  só avisar.
- **Temas prontos:** 4–6 combinações de um clique ("Azul confiança",
  "Verde natureza", "Grafite elegante", "Vinho sofisticado", "Claro
  minimalista"…) que preenchem as quatro cores; "Voltar ao padrão" limpa.
- O site do grupo aplica as quatro cores como variáveis CSS no segmento do
  site do grupo (como a 0209 faz com a principal), nos dois temas
  claro/escuro: com fundo e texto definidos pelo grupo, o seletor de tema
  claro/escuro do site do grupo pode ficar fixo no claro ou respeitar as
  cores escolhidas — escolha o mais simples e coerente e registre.

## Regras e verificação

- **A Next Home (grupo 1) não muda nada** (os testes de igualdade da etapa
  anterior continuam valendo e passando).
- tsc (4 erros conhecidos de PixelMeta), `npx vitest run --exclude ".claude/**"`,
  `npm run db:teste` + `*.db.test.ts` com `DB_TESTE_URL`, `supabase stop`.
  Testes: redução de imagem (função pura de dimensões), validação de hex,
  contraste, temas prontos válidos, grupo 1 inalterado.
- Vault (atualizar a nota `meu-site-da-imobiliaria`), fim da
  `docs/MEMORIA.md` (append) e `docs/HANDOFF-MULTI-GRUPO.md`.
