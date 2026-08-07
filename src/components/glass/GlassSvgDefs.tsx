/**
 * Filtro de distorção usado pelo fallback em CSS do liquid glass.
 * Renderizado uma única vez no layout; a marcação é estática, então roda no
 * servidor e não custa JavaScript.
 */
export function GlassSvgDefs() {
  return (
    <svg aria-hidden focusable="false" className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter id="nh-vidro" x="0%" y="0%" width="100%" height="100%">
          {/* Ruído de baixa frequência: ondas largas, não granulado. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.005 0.011"
            numOctaves="2"
            seed="7"
            result="ruido"
          />
          <feGaussianBlur in="ruido" stdDeviation="2.5" result="ruidoSuave" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="ruidoSuave"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
