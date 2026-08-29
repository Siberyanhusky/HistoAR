/**
 * monitoring.ts - Error tracking (Sentry) untuk HistoAR.
 *
 * Tujuan: melihat error yang terjadi di PERANGKAT SISWA (HP) yang tak bisa kita
 * reproduksi sendiri - terutama kegagalan AR (WebGL/MindAR/three, model gagal
 * muat). Tanpa ini, bug di HP hanya bisa ditebak dari screenshot.
 *
 * DSN dibaca dari `VITE_SENTRY_DSN`. Kalau kosong (belum diisi), init jadi
 * NO-OP total - app tetap jalan normal, tak ada error. Jadi aman di-merge
 * sebelum akun Sentry siap; cukup isi env var-nya nanti (di .env & Vercel).
 * DSN aman diekspos ke client (memang dirancang publik).
 */
import * as Sentry from "@sentry/react";

let started = false;

export function initMonitoring() {
  // Hanya di browser (error AR terjadi di sisi client) & sekali saja.
  if (started || typeof window === "undefined") return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // belum dikonfigurasi → no-op

  started = true;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Fokus ke error, bukan perf: sampling ringan agar tak membebani HP/kuota.
    tracesSampleRate: 0.1,
    // Jangan kirim data pribadi.
    sendDefaultPii: false,
    // Buang noise yang tak actionable (ekstensi browser, dsb).
    ignoreErrors: ["ResizeObserver loop limit exceeded", "Non-Error promise rejection captured"],
  });

  // Konteks perangkat yang relevan buat mendiagnosis masalah AR di HP.
  Sentry.setContext("device", {
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  });
}

/** Tangkap error umum (mis. dari ErrorComponent route). No-op jika Sentry off. */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Tangkap kegagalan muat model AR dengan konteks kaya (materi, target, url).
 * Inilah yang membuat "model tidak muncul di HP" jadi terlihat + bisa dilacak.
 */
export function captureArModelError(info: {
  materi?: string;
  targetKey: string;
  src: string;
  detail?: unknown;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("subsystem", "ar");
    scope.setTag("ar.target", info.targetKey);
    if (info.materi) scope.setTag("ar.materi", info.materi);
    scope.setContext("ar_model", { src: info.src, detail: safeDetail(info.detail) });
    Sentry.captureMessage(`AR model gagal dimuat: ${info.targetKey}`, "error");
  });
}

/** Breadcrumb lifecycle AR - jejak langkah sebelum error muncul. */
export function arBreadcrumb(message: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ category: "ar", level: "info", message, data });
}

function safeDetail(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}
