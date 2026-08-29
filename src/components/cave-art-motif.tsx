/**
 * Motif lukisan gua: siluet garis ala cap tangan & hewan buruan (Leang-Leang,
 * Sulawesi), digambar tangan sebagai SVG, bukan foto stok (gak ada aset foto
 * situs beneran yang boleh dipakai). Warnanya bone-white pudar (bukan
 * oker-oranye) biar tetap masuk disiplin "satu aksen": ini tekstur, bukan
 * pernyataan warna.
 */

function HandStencil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 110" className={className} fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <ellipse cx="45" cy="72" rx="20" ry="26" />
        <ellipse cx="18" cy="30" rx="6" ry="22" transform="rotate(-18 18 30)" />
        <ellipse cx="32" cy="18" rx="6" ry="26" transform="rotate(-7 32 18)" />
        <ellipse cx="48" cy="14" rx="6" ry="27" />
        <ellipse cx="64" cy="18" rx="6" ry="26" transform="rotate(9 64 18)" />
        <ellipse cx="76" cy="32" rx="6" ry="21" transform="rotate(24 76 32)" />
      </g>
    </svg>
  );
}

function HuntedBull({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 110" className={className} fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M45 65 Q90 30 150 45 Q175 52 170 65 Q165 78 140 75 Q95 90 55 82 Q35 78 45 65 Z" />
        <path d="M45 65 Q28 55 18 40" />
        <path d="M18 40 Q10 28 14 16" />
        <path d="M18 40 Q28 32 34 20" />
        <path d="M60 82 L55 104" />
        <path d="M80 85 L78 106" />
        <path d="M130 78 L136 100" />
        <path d="M150 68 L160 88" />
        <path d="M170 65 Q180 62 188 68" />
      </g>
    </svg>
  );
}

function HunterFigure({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 70 100" className={className} fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="35" cy="12" r="6" />
        <path d="M35 18 L30 55" />
        <path d="M30 55 L16 90" />
        <path d="M30 55 L48 88" />
        <path d="M32 28 L58 14" />
        <path d="M58 14 L70 2" />
        <path d="M32 34 L14 40" />
      </g>
    </svg>
  );
}

function WildBoar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 90" className={className} fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 50 Q20 28 42 20 Q80 6 122 22 Q142 30 138 46 Q134 60 112 58 Q100 68 78 66 Q50 70 34 60 Q24 56 28 50 Z" />
        <path d="M28 50 L10 44" />
        <path d="M10 44 L2 34" />
        <path d="M10 44 L4 54" />
        <path d="M34 24 L26 10" />
        <path d="M44 20 L40 6" />
        <path d="M46 58 L42 82" />
        <path d="M64 64 L60 86" />
        <path d="M92 64 L96 86" />
        <path d="M110 58 L116 80" />
        <path d="M138 46 Q150 42 156 48" />
      </g>
    </svg>
  );
}

const MOTIFS = [
  { Cmp: HandStencil, box: "-left-6 top-[6%]", size: "h-24 w-24 sm:h-40 sm:w-40", rot: "-rotate-6" },
  { Cmp: HunterFigure, box: "left-[22%] top-[4%]", size: "h-14 w-14 sm:h-20 sm:w-20", rot: "rotate-6" },
  { Cmp: WildBoar, box: "left-[42%] top-[10%]", size: "h-16 w-28 sm:h-24 sm:w-44", rot: "-rotate-2" },
  { Cmp: HuntedBull, box: "right-[-4%] top-[16%]", size: "h-32 w-64 sm:h-44 sm:w-96", rot: "rotate-2" },
  { Cmp: HandStencil, box: "right-[26%] top-[30%]", size: "h-10 w-10 sm:h-16 sm:w-16", rot: "rotate-12" },
  { Cmp: WildBoar, box: "left-[4%] top-[38%]", size: "h-10 w-16 sm:h-14 sm:w-24", rot: "rotate-4" },
  { Cmp: HunterFigure, box: "left-[46%] top-[42%]", size: "h-28 w-28 sm:h-40 sm:w-40", rot: "-rotate-3" },
  { Cmp: HandStencil, box: "left-[6%] top-[58%]", size: "h-32 w-32 sm:h-48 sm:w-48", rot: "rotate-12" },
  { Cmp: WildBoar, box: "right-[6%] top-[56%]", size: "h-20 w-36 sm:h-28 sm:w-52", rot: "rotate-3" },
  { Cmp: HunterFigure, box: "left-[28%] top-[70%]", size: "h-16 w-16 sm:h-24 sm:w-24", rot: "rotate-3" },
  { Cmp: HuntedBull, box: "left-[-6%] bottom-[2%]", size: "h-16 w-32 sm:h-20 sm:w-44", rot: "-rotate-2" },
  { Cmp: HandStencil, box: "right-[8%] bottom-[4%]", size: "h-20 w-20 sm:h-28 sm:w-28", rot: "-rotate-6" },
  { Cmp: WildBoar, box: "right-[38%] bottom-[6%]", size: "h-12 w-20 sm:h-16 sm:w-28", rot: "rotate-6" },
] as const;

export function CaveArtMotif() {
  return (
    <div className="absolute inset-0 overflow-hidden text-foreground/[0.14]">
      {MOTIFS.map(({ Cmp, box, size, rot }, i) => (
        <Cmp key={i} className={`absolute ${box} ${size} ${rot}`} />
      ))}
    </div>
  );
}
