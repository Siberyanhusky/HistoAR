import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
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
      },
    }),
    viteReact(),
  ],
});
