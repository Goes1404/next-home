/**
 * Shader do liquid glass.
 *
 * WebGL não consegue ler o DOM, então não dá para refratar "o que estiver
 * atrás" de verdade. O que fazemos é refratar a *mesma imagem de fundo* que a
 * página já mostra em full-bleed: o componente calcula qual recorte dessa
 * imagem está sob o painel e o shader amostra esse recorte com deslocamento.
 * O resultado é opticamente correto, porque a fonte é literalmente o que o
 * usuário vê atrás do vidro.
 *
 * A refração vem de um campo de distância (SDF) de retângulo arredondado: a
 * borda funciona como o bisel de uma lente — quase nenhum desvio no centro,
 * desvio forte junto à borda —, que é o que dá a leitura de "vidro espesso".
 */

export const vertex = /* glsl */ `#version 300 es
in vec2 uv;
in vec2 position;
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const fragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tMap;
uniform float uHasTexture;

uniform vec2  uPanel;      // tamanho do painel em px
uniform vec4  uBgRect;     // xy = origem do painel na textura, zw = extensão (uv)
uniform float uRadius;     // raio do canto, px
uniform float uThickness;  // largura do bisel, px

uniform float uRefraction; // intensidade do desvio, px
uniform float uChromatic;  // separação RGB
uniform float uBlur;       // desfoque do fundo, px
uniform float uLiquid;     // amplitude da ondulação
uniform float uTime;

uniform vec3  uTint;
uniform float uTintAmount;

const vec2 LUZ = vec2(-0.55, 0.84); // direção da luz: alto-esquerda

float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

/** Normal da superfície = gradiente do SDF, por diferenças finitas. */
vec2 sdfNormal(vec2 p, vec2 halfSize, float r) {
  const float e = 1.0;
  float dx = sdRoundRect(p + vec2(e, 0.0), halfSize, r)
           - sdRoundRect(p - vec2(e, 0.0), halfSize, r);
  float dy = sdRoundRect(p + vec2(0.0, e), halfSize, r)
           - sdRoundRect(p - vec2(0.0, e), halfSize, r);
  vec2 n = vec2(dx, dy);
  float len = length(n);
  return len > 0.0001 ? n / len : vec2(0.0);
}

/** Fundo procedural, usado enquanto a textura não carregou. */
vec3 fundoProcedural(vec2 uv) {
  vec3 fundo = vec3(0.016, 0.043, 0.039);
  vec3 brilho = vec3(0.0, 0.33, 0.29);
  float d = distance(uv, vec2(0.35, 0.25));
  return mix(brilho, fundo, smoothstep(0.0, 0.9, d));
}

vec3 amostra(vec2 uv) {
  if (uHasTexture < 0.5) return fundoProcedural(uv);
  return texture(tMap, clamp(uv, 0.001, 0.999)).rgb;
}

/** Desfoque de 8 taps em espiral — barato e suficiente nesta escala. */
vec3 amostraDesfocada(vec2 uv, vec2 escala, float raio) {
  if (raio < 0.35) return amostra(uv);
  vec3 soma = amostra(uv);
  float total = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853981634; // 2pi/8
    float r = raio * (0.45 + 0.55 * float(i % 3) / 2.0);
    vec2 off = vec2(cos(a), sin(a)) * r * escala;
    soma += amostra(uv + off);
    total += 1.0;
  }
  return soma / total;
}

void main() {
  vec2 halfSize = uPanel * 0.5;
  vec2 p = (vUv - 0.5) * uPanel;

  float d = sdRoundRect(p, halfSize, uRadius);

  // Máscara antisserrilhada do painel.
  float mascara = 1.0 - smoothstep(-1.0, 1.0, d);
  if (mascara <= 0.001) discard;

  vec2 n = sdfNormal(p, halfSize, uRadius);

  // Perfil do bisel: 0 na borda, 1 no interior plano.
  float t = clamp(-d / max(uThickness, 1.0), 0.0, 1.0);
  // Curva de lente: a inclinação cresce rápido perto da borda.
  float altura = sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0));
  float desvio = (1.0 - altura) * uRefraction;

  // Ondulação lenta que tira o aspecto de vidro estático.
  if (uLiquid > 0.0) {
    float onda = sin(p.x * 0.018 + uTime * 0.7) * cos(p.y * 0.022 - uTime * 0.5);
    desvio += onda * uLiquid * (1.0 - t * 0.65);
  }

  // px -> uv da textura de fundo
  vec2 escala = uBgRect.zw / uPanel;
  vec2 uvBase = uBgRect.xy + vUv * uBgRect.zw;
  vec2 offset = -n * desvio * escala;

  // Aberração cromática: cada canal refrata um pouco diferente.
  float ab = uChromatic * (1.0 - t);
  vec3 cor;
  cor.r = amostraDesfocada(uvBase + offset * (1.0 + ab), escala, uBlur).r;
  cor.g = amostraDesfocada(uvBase + offset, escala, uBlur).g;
  cor.b = amostraDesfocada(uvBase + offset * (1.0 - ab), escala, uBlur).b;

  // Tingimento da marca, mais presente onde o vidro é "mais espesso".
  cor = mix(cor, mix(cor, uTint, 0.85), uTintAmount * (0.45 + 0.55 * (1.0 - t)));

  // Especular na borda voltada para a luz.
  float voltadaParaLuz = max(dot(n, LUZ), 0.0);
  float borda = 1.0 - smoothstep(0.0, 1.0, t);
  float brilho = pow(voltadaParaLuz, 3.0) * borda;
  cor += vec3(brilho) * 0.42;

  // Sombra na borda oposta, que dá espessura ao painel.
  float sombra = pow(max(dot(n, -LUZ), 0.0), 3.0) * borda;
  cor -= vec3(sombra) * 0.16;

  // Fio de luz de 1px no contorno, a assinatura do liquid glass.
  float fio = smoothstep(1.5, 0.0, abs(d)) * (0.28 + 0.5 * voltadaParaLuz);
  cor += vec3(fio) * 0.5;

  fragColor = vec4(cor, mascara);
}
`;
