import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Vite default-nya nge-bundle JS/CSS ke folder "assets" - PERSIS nama
  // folder public/assets/ (tempat model/marker/audio mentah kita). Dua-duanya
  // ketemu di URL prefix yang sama ("/assets/...") di build output, dan
  // aturan cache immutable-1-tahun yang ditujukan buat bundle Vite (nama file
  // ada hash-nya, aman) ikut nyantol ke file mentah kita (nama filenya TETAP,
  // jadi TIDAK aman di-cache selamanya - lihat komentar routeRules di bawah).
  // Pindahin output bundle Vite ke folder lain ("_app") biar dua-duanya gak
  // pernah tabrakan URL prefix - jadi override cache-control routeRules di
  // bawah beneran kepakai, gak keburu ketiban aturan immutable punya bundle.
  build: { assetsDir: "_app" },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts
      server: { entry: "server" },
    }),
    // preset "vercel" tells Nitro to output the build in the format
    // Vercel expects (the Lovable default was "cloudflare")
    nitro({
      preset: "vercel",
      // Header keamanan murah yang aman buat semua route (termasuk aset
      // statis) - dipasang lewat routeRules Nitro (bukan vercel.json
      // terpisah) supaya benar-benar ke-bake ke build output Vercel, bukan
      // berpotensi ke-abaikan/override. Sengaja TIDAK termasuk
      // Content-Security-Policy: app ini pakai WebGL/kamera getUserMedia/
      // audio blob/fetch ke Kie.ai/Sentry/Upstash - CSP yang kurang tepat
      // bisa diam-diam mematikan AR/chatbot tanpa error yang jelas ke siswa,
      // itu kerjaan terpisah yang butuh testing hati-hati.
      routeRules: {
        "/**": {
          headers: {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Frame-Options": "SAMEORIGIN",
          },
        },
        // Default preset "vercel" nge-cache SEMUA isi /assets/ immutable
        // selama 1 tahun - pas buat bundle JS/CSS Vite (nama filenya
        // mengandung hash konten, jadi otomatis berubah tiap kali isinya
        // beda). TAPI model .glb, marker .mind, dan audio .mp3 di
        // public/assets/{models,ar,audio}/ TIDAK punya hash di nama file -
        // begitu di-redeploy dengan isi baru tapi nama sama, browser/CDN
        // siswa yang udah pernah buka halaman itu bisa nolak fetch ulang
        // sampai SETAHUN (ini yang bikin marker/model yang baru di-fix
        // kelihatan "belum berubah" walau deploy-nya udah sukses). Override
        // tiga subfolder ini ke cache pendek (5 menit) supaya perbaikan
        // beneran nyampe ke HP siswa dalam waktu wajar, tanpa kehilangan
        // manfaat cache immutable buat bundle JS/CSS yang memang aman.
        "/assets/models/**": { headers: { "cache-control": "public, max-age=300, must-revalidate" } },
        "/assets/ar/**": { headers: { "cache-control": "public, max-age=300, must-revalidate" } },
        "/assets/audio/**": { headers: { "cache-control": "public, max-age=300, must-revalidate" } },
      },
    }),
    viteReact(),
  ],
});
