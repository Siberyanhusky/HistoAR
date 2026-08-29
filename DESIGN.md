# HistoAR - Design System

## Tesis Visual

**"Jurnal lapangan situs purbakala Indonesia, didigitalkan."**

HistoAR bukan demo teknologi AR - ia adalah arsip/museum digital yang kebetulan punya AR
sebagai salah satu alat. Setiap keputusan desain melayani kesan **"serius & otentik seperti
museum sungguhan"**, bukan "canggih & futuristik". Ketika keduanya bentrok, otentisitas menang.

Referensi material: kertas lapuk, tinta, batu, tanah gelap situs gua, bara obor yang dipakai
menerangi lukisan gua, perunggu yang teroksidasi jadi patina hijau. Bukan referensi: layar HUD
sci-fi, kaca neon, hologram.

## Yang Sengaja Ditinggalkan (anti-slop checklist)

Jangan gunakan lagi, di komponen manapun:
- Gradient "aurora" biru-ungu sebagai background
- `glass` / `glass-strong` (glassmorphism/backdrop-blur sebagai gaya default)
- `text-holo`, `bg-holo`, `shadow-holo`, `ring-holo`, efek glow neon
- Partikel melayang generik (`particles.tsx`, `animate-float`, `pulse-ring`, `shimmer`)
- Font Inter/Space Grotesk sebagai display
- Card generik serba rounded-2xl + drop shadow lembut tanpa alasan
- Layout "hero tengah-simetris + 3 kolom ikon" generik

Kalau sebuah komponen butuh motion, defaultnya: fade + naik sedikit (scroll reveal pelan),
bukan bounce/pulse/shimmer.

## Tipografi

| Peran | Font | Alasan |
|---|---|---|
| Display / heading (h1-h4) | **Fraunces** (variable, optical sizing "soft") | Serif hangat-bertekstur, editorial, punya karakter tulisan arkeolog tanpa jadi klise serif berita |
| Body / UI | **Public Sans** | Sans humanis, keterbacaan tinggi untuk siswa SMA, bukan Inter default |
| Label / mono (nomor katalog, koordinat, meta AR) | **IBM Plex Mono** | Motif "kartu katalog museum" - huruf kecil, letter-spacing lebar, UPPERCASE |

Muat via Google Fonts (`@fontsource` atau `<link>` di `__root.tsx`), self-host kalau perlu offline.

Skala heading pakai Fraunces optical size besar di h1 (contoh: `clamp(2.5rem, 5vw, 4.5rem)`),
letter-spacing sedikit negatif di ukuran besar, sedikit positif di label mono kecil.

## Warna (dark-first - scene AR butuh background gelap, tapi hangat bukan biru-dingin)

Base OKLCH, hue di kisaran 40-70 (coklat-oranye-hijau), BUKAN 200-280 (biru-ungu) yang dipakai
versi lama.

```css
--background:        oklch(0.16 0.02 55);   /* charcoal-basalt hangat, bukan navy */
--foreground:         oklch(0.94 0.015 75);  /* putih tulang/perkamen */
--card:               oklch(0.21 0.025 55);
--card-foreground:    oklch(0.94 0.015 75);
--muted:              oklch(0.26 0.02 55);
--muted-foreground:   oklch(0.68 0.03 60);
--border:             oklch(1 0 0 / 8%);

--primary (ember):    oklch(0.68 0.16 45);   /* terakota/bara api */
--primary-foreground: oklch(0.16 0.02 55);
--secondary (patina): oklch(0.55 0.08 150);  /* hijau lumut/perunggu teroksidasi */
--secondary-foreground: oklch(0.96 0.01 90);
--accent (ochre):     oklch(0.72 0.13 75);   /* pigmen oker lukisan gua */
--destructive:        oklch(0.6 0.2 25);
```

Tidak ada `--gradient-aurora`, `--holo`, `--shadow-holo`. Boleh ada `--grain` (noise tipis, SVG
turbulence, opacity ~3-4%) untuk tekstur "kertas/batu" di background - ganti peran aurora sebagai
"sesuatu yang bikin background tidak flat", tapi tanpa warna neon.

## Layout & Komposisi

- Viewport pertama = **poster**, bukan dokumen: satu headline Fraunces besar + satu visual
  kuat (render 3D/AR atau foto artefak), minim chrome.
- Label ala kartu katalog museum sebagai motif berulang: mono, uppercase, letter-spacing lebar,
  contoh `NO. 03 - SITUS MEGALITIK`, `KOLEKSI ZAMAN LOGAM`.
- Grid editorial dengan padding generus di sekitar gambar/model 3D - biarkan visual "bernapas",
  jangan dijejali kartu-kartu kecil berimpitan.
- Border tipis (hairline, `border-white/8`) menggantikan drop-shadow lembut sebagai pemisah.

## Motion

- Scroll reveal: fade-in + translateY(12px→0), durasi ~500-700ms, easing tenang (`ease-out`
  atau cubic-bezier custom yang tidak bouncy).
- Transisi antar state: crossfade lambat, bukan snap.
- AR/interaksi teknis (viewer 3D, tombol scan): boleh sedikit lebih "presisi/cepat" karena itu
  memang alat, tapi tetap tanpa glow/pulse neon - pakai perubahan warna aksen ember + border.

## Komponen yang perlu direbuild

1. `styles.css` - tokens, font, hapus utilities lama (glass/holo/aurora/particle keyframes)
2. `nav.tsx`, `footer.tsx`, `aurora-background.tsx` (ganti jadi grain/texture background atau hapus), `particles.tsx` (hapus/ganti)
3. `sections/hero.tsx`, `ar-showcase.tsx`, `experience.tsx`, `learn.tsx`, `timeline.tsx`, `quiz.tsx`, `ai-guide.tsx`
4. `histoar/MateriGrid.tsx`, `QuizPanel.tsx`, `ArScan.tsx`, `Chatbot.tsx`, `CoreSample.tsx`
5. `routes/materi/*`, `routes/quiz/*`, `routes/index.tsx`
6. `ui/*` (shadcn primitives) - sesuaikan token warna & radius, TIDAK perlu ditulis ulang total
