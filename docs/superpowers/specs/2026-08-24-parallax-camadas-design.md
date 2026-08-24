# Parallax e camadas no site público — design

> Data: 2026-08-24 · Branch: `ingestao-de-midia`
> Intensidade escolhida: **cinematográfica** no desktop, **reduzida** no celular.

## Problema

O site público já tem entrada animada (`Reveal`, `TituloEditorial`) e dois usos
isolados de parallax (`ParallaxImagem` na Galeria e no Sobre). O resultado é um
site que *aparece* mas não tem **profundidade**: tudo vive num plano só, e a
foto — que é o produto de uma imobiliária — não se comporta diferente do texto.

O pedido é somar parallax e camadas "em praticamente tudo", com avaliação
elemento por elemento. Avaliar importa: aplicar em tudo, literalmente, moveria
alvos de clique, mapas e formulários — trocando visual por defeito.

## Decisão central: um controlador, não N ScrollTriggers

Aplicar o padrão atual (`ParallaxImagem` cria o próprio `ScrollTrigger`) a ~20
componentes daria 60–90 triggers por página. Cada `ScrollTrigger.refresh()`
(que acontece a cada resize, troca de tema e navegação) recalcularia todos.

Em vez disso: **`controladorCamadas.ts`**, um módulo com um único
`ScrollTrigger` e um laço no ticker do GSAP — o mesmo ticker que o Lenis já
usa (`SmoothScroll.tsx`), então nenhum relógio novo entra no sistema.

- Elementos se registram (`registrarCamada(el, opcoes)`) e recebem um
  `quickSetter` de `transform`.
- O controlador lê `getBoundingClientRect` **uma vez por frame por elemento
  visível**, com `IntersectionObserver` cortando o que está fora da tela.
- Uma flag central (`camadasLigadas()`) responde por `prefers-reduced-motion`,
  `.motion-off` e pela redução do celular — em UM lugar, não em 20.

Alternativas descartadas:

- **Componente por componente**: espalha `matchMedia`/reduced-motion por 20
  arquivos e multiplica triggers.
- **`ScrollSmoother` do GSAP** (`data-speed` nativo): substituiria o Lenis, que
  já está calibrado e casado com o ScrollTrigger. Risco sem ganho.

## Primitivas novas (`src/components/motion/`)

| Arquivo | Papel |
|---|---|
| `controladorCamadas.ts` | Registro, laço no ticker, orçamento e regra de mobile. Lógica pura testável separada em `camadasCalculo.ts`. |
| `camadasCalculo.ts` | Função pura `deslocamentoDe(progresso, velocidade, eixo)` — o que o teste exercita, sem DOM. |
| `Camada.tsx` | Embrulho declarativo: `<Camada velocidade={0.3} eixo="y" apenasDesktop>`. Aceita qualquer filho, não só imagem. |
| `HeaderCondensado.tsx` | Encolhe/condensa o header no scroll (altura, blur, borda). |

`ParallaxImagem.tsx` é reescrito **por dentro** para delegar ao controlador. A
API pública (`className`, `intensidade`) não muda — os dois usos atuais seguem
funcionando sem edição.

`CartaoTilt.tsx` ganha uma prop opcional `velocidadeCamada` para participar do
parallax de grade sem perder a cortina de entrada que já tem.

## Regra de mobile

Uma regra, no controlador: abaixo de 768px toda velocidade cai a **40%**, e
elementos marcados `apenasDesktop` não se registram. `pin`, `scrub` e `tilt`
continuam desktop-only, como já são hoje.

Isto respeita o que o projeto já mediu: o tráfego real vem de link de WhatsApp
no telefone, e o vídeo do hero já foi cortado no mobile por peso (14,8 MB).

## Auditoria: o que ganha efeito e o que fica parado

### Home `/`

| Elemento | Verdito | Tratamento |
|---|---|---|
| Hero (vídeo + título + busca) | **alto** | Três planos: véu escurecendo com o scroll, título a 1.35x, painel de busca a 1.15x. |
| `ScrollCue` | parado | 20px de altura. |
| Cards "Selecionados" | **alto** | Tilt + capa com parallax *dentro* da moldura do card. |
| Chips de região | camada só | Chip é alvo de clique. A banda ganha fundo em duas camadas. |
| Globo / Mapa | parado | WebGL + Leaflet já disputam o `orcamentoWebgl`. |
| Cards de corretor | leve | Tilt suave. Foto de pessoa não pede deslocamento. |
| Card "Tem imóvel para vender?" | sim | Brilho que segue o cursor. Camada, sem deslocamento. |
| `CtaFinal` | só entrada | É a conversão; movimento atrás de um botão atrapalha o clique. |
| Endereço / CRECI | parado | Texto legal. |

### Página do imóvel `/empreendimentos/[slug]`

| Elemento | Verdito | Tratamento |
|---|---|---|
| `Hero` da capa | **maior ganho** | `scale` 1.0→1.12, véu fechando progressivo, nome subindo mais rápido que a barra de preço. |
| `FichaNumeros` | moderado | Deslocamento vertical diferencial por coluna (±10px escalonado). |
| `NavAncoras` | parado | Navegação. |
| `Sobre` | sim | Intensidade sobe para 20% e o texto desloca **contra** a foto — é o par que produz a camada. |
| `CenaShowcase` | **alto** | Ken Burns por cena sobre o pin+scrub existente; celular ganha versão reduzida (hoje só tem `Reveal`). |
| `BookDigital` | leve | A luz de fundo decorativa (já existe) vira camada com deslocamento próprio. |
| `Tipologias` | moderado | Tilt no card + planta deslizando na própria janela. |
| `Lazer` | camada só | Lista é alvo de toque, e a prévia é `fixed` num portal — parallax no ancestral quebra o containing block. |
| `Galeria` | **alto** | Destaque com parallax mais forte; cada coluna do mosaico com velocidade própria. |
| `Video` / `Tour360` | parado | Mover moldura de player é defeito, não efeito. |
| `Localizacao` | parado | Leaflet. |
| `Contato` | parado | Formulário. |
| `Similares` | sim | Mesmo tratamento dos cards da home. |

### Listagem, portfólio, institucionais

| Elemento | Verdito | Tratamento |
|---|---|---|
| Grid de `/empreendimentos` | **alto** | Parallax escalonado por coluna + tilt. |
| Filtros / `FiltroSheet` | parado | Ferramenta. |
| Hero do `/portfolio` | sim | Mesmo tratamento do hero da home — é a peça que o corretor manda ao cliente. |
| `TimelineEmpreendimentos` | leve | É um slider HORIZONTAL, não uma linha vertical: as capas ganham parallax no eixo X conforme o carrossel anda. |
| `SimuladorInvestimento` | parado | Ferramenta com input. |
| `NossaEssencia` / `SeloSeguranca` | leve | Entrada em camadas, sem deslocamento contínuo. |
| `SiteHeader` / `HeaderInstitucional` | sim | Condensa no scroll. Melhora o uso, não só o visual. |
| `MenuMobile` | parado | Já tem armadilha de portal por `backdrop-filter`. |
| `Footer` | camada só | Camada de fundo revelada por baixo. |

Placar: **18 ganham efeito, 5 ganham só camada de fundo, 11 ficam parados de
propósito.**

## Guardas obrigatórias

Todas vêm de armadilhas já pagas neste projeto (ver `docs/MEMORIA.md`):

1. `prefers-reduced-motion` e `.motion-off` desligam tudo — contrato do
   `.gsap-pending` (`globals.css:723`).
2. **Um dono por opacidade**: elemento dentro de `Reveal` não ganha camada de
   opacidade própria.
3. Nada `position: fixed` dentro de elemento com `transform` ou
   `backdrop-filter` (Lightbox, prévia do Lazer, MenuMobile). Já mordeu 3x.
4. Só `transform` e `opacity`. Nenhum `top`, `margin` ou `width`.
5. `cn` (twMerge) não pode tocar `className` que carregue `text-fluid-*`.
6. O controlador vive no mesmo ticker do Lenis — nenhum `requestAnimationFrame`
   novo.

## Teste

`camadasCalculo.test.ts` exercita a função pura: progresso 0/0.5/1, velocidade
negativa (camada contrária), redução de mobile a 40%, e o corte por
`apenasDesktop`. Mesmo padrão de `transicaoGlobo.test.ts` — regra pura, sem
DOM, que é o que de fato pode regredir em silêncio.

## Fora de escopo

- Painel do corretor (`/corretor/*`). É ferramenta mobile-first; parallax lá
  é ruído.
- Trocar Lenis por ScrollSmoother.
- Reescrever `TimelineEmpreendimentos`, que hoje usa dados hardcoded do
  Unsplash — problema de conteúdo, não de movimento.
