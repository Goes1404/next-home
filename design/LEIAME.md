# Desenhos — fonte dos canvas publicados

Cada `*.dc.html` é um artboard; `canvas.json` diz onde cada um fica.
O arquivo publicado (`*.html`, fora do git) é gerado a partir daqui pela
skill `/design` e some junto com o container — estes fontes é que
persistem.

## Aviso de número fora do ar (31/08/2026)

Faixa no painel + e-mail para o incidente de 28/08, em que o WhatsApp
saiu do ar por três dias sem ninguém ser avisado (ver H0.0 no
`docs/ROADMAP.md`).

| artboard | o que é |
|---|---|
| `Main.dc.html` | a faixa em contexto, no Início, 390×844 |
| `Estados.dc.html` | os três estados, tema escuro |
| `Claro.dc.html` | os três estados, tema claro |
| `Email.dc.html` | o e-mail de alerta |

As cores saem de `src/app/globals.css` com os valores literais resolvidos
(os tokens semânticos `perigo` / `alerta` / `info` nos dois temas), e a
anatomia — `rounded-2xl`, `p-4`, ícone de 16-18px, `text-fluid-xs`,
`text-titulo` no negrito — é a do aviso que já existe em
`ContasManager.tsx` e no `WhatsappManager.tsx`.
