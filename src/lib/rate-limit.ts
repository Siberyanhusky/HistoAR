// Rate-limit terpusat untuk endpoint AI (dipanggil di /api/chat & askHistoAI).
//
// Pakai Upstash Redis (sliding window) supaya batasan tetap konsisten di
// lingkungan serverless (Vercel) yang instance-nya bisa hidup-mati.
//
// Kalau env UPSTASH_* belum diset (mis. saat dev lokal), rate-limit otomatis
// dinonaktifkan - semua request dilewatkan - jadi app tetap jalan tanpa Redis.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// Maks 15 permintaan per 60 detik per identitas (IP). Cukup longgar untuk
// siswa yang belajar normal, tapi mematikan skrip/loop yang nge-spam API.
const ratelimit =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(15, "60 s"),
        prefix: "histoar:ai",
        analytics: false,
      })
    : null;

export interface RateLimitResult {
  success: boolean;
  /** Sisa jatah dalam window; -1 kalau rate-limit dinonaktifkan. */
  remaining: number;
  /** Epoch ms kapan window reset; 0 kalau dinonaktifkan. */
  reset: number;
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  if (!ratelimit) return { success: true, remaining: -1, reset: 0 };
  const { success, remaining, reset } = await ratelimit.limit(identifier);
  return { success, remaining, reset };
}

/** Ambil identitas kasar (IP) dari header request untuk kunci rate-limit. */
export function clientIdFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || headers.get("x-real-ip") || "anon";
  return ip;
}
