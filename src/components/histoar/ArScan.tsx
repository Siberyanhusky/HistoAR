// Port dari materi-detail.html (mode AR) - restyle ala HistoAR-Futuristik,
// logic imperatif MindAR/A-Frame tetap dipakai lewat ArEngine.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { loadScript } from "@/lib/load-script";
import { ArEngine } from "@/lib/ar-engine";
import { arBreadcrumb, captureArModelError } from "@/lib/monitoring";
import type { ArMateriConfig } from "@/lib/histoar-types";
import { ChevronLeft, Info, Plus, Minus, RotateCcw, Ruler, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X, Box, Play, Pause } from "lucide-react";

export function ArScan({
  materiId,
  materiJudul,
  arConfig,
  onAllExplored,
}: {
  materiId: string;
  materiJudul: string;
  arConfig: ArMateriConfig;
  onAllExplored: () => void;
}) {
  const navigate = useNavigate();
  const engineRef = useRef<ArEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [scanHintVisible, setScanHintVisible] = useState(true);
  const [showViewControls, setShowViewControls] = useState(false);
  const [showMoveControls, setShowMoveControls] = useState(false);
  const [panelHidden, setPanelHidden] = useState(true);
  // Panel di-peek (pendek) secara default supaya area scan AR lega di HP;
  // tap gagang untuk melebarkan & baca detail. Fix "kepotong / nggak full layar".
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [reopenVisible, setReopenVisible] = useState(false);
  // Panel bisa DIGESER turun-naik dengan menarik gagangnya, karena di HP kecil
  // sheet ini menutupi model/diorama yang lagi dijelaskan. Nilainya piksel ke
  // bawah dari posisi normal; 0 = penuh. Baris hotspot sengaja dijaga tetap
  // terlihat (lihat clamp di onHandleMove) supaya siswa masih bisa ganti bagian
  // tanpa menarik panelnya balik ke atas dulu.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const dragState = useRef<{ startY: number; startOffset: number; max: number; moved: boolean } | null>(null);

  const onHandleDown = (e: React.PointerEvent) => {
    const h = panelRef.current?.getBoundingClientRect().height ?? 0;
    dragState.current = {
      startY: e.clientY,
      startOffset: sheetOffset,
      max: Math.max(0, h - 120), // sisakan gagang + baris hotspot
      moved: false,
    };
    // Pointer capture cuma kenyamanan (biar jari boleh keluar dari gagang saat
    // menyeret). Kalau browser menolak, seret TETAP harus jalan - jangan sampai
    // melempar dan membatalkan sisa handler.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer sudah tidak aktif; abaikan */
    }
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    setSheetOffset(Math.min(d.max, Math.max(0, d.startOffset + dy)));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = dragState.current;
    dragState.current = null;
    // WAJIB di-try: releasePointerCapture melempar NotFoundError kalau pointer-nya
    // sudah tidak dilacak, dan lemparan itu membatalkan toggle di bawahnya -
    // gagang jadi bisa diseret tapi tidak bisa di-tap.
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* tidak pernah ter-capture; abaikan */
    }
    // Tarikan pendek = tap: pakai untuk buka/tutup detail seperti sebelumnya.
    if (d && !d.moved) setPanelExpanded((v) => !v);
  };
  const [gate, setGate] = useState({ done: 0, total: 0, unlocked: false });
  const [modelError, setModelError] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const [narration, setNarration] = useState({ playing: false, hasAudio: false });
  // Alat kalibrasi (Salin-View + D-pad) hanya untuk dev/kalibrator, tidak untuk
  // siswa. Aktif saat dev-build ATAU URL punya ?dev=1 (mis. di Vercel Preview).
  // Dihitung setelah mount supaya tidak memicu hydration mismatch.
  const [showDevTools, setShowDevTools] = useState(false);
  useEffect(() => {
    setShowDevTools(
      import.meta.env.DEV ||
        new URLSearchParams(window.location.search).get("dev") === "1",
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // Di-serve dari origin sendiri (public/vendor/), BUKAN CDN. Dua alasan:
      // 1) service worker nggak bisa precache script cross-origin dengan andal,
      //    jadi selama ini dari aframe.io/jsdelivr, mode offline mustahil dibikin.
      // 2) jaringan sekolah kadang nge-filter atau nge-throttle CDN. Kalau itu
      //    kejadian, AR gagal start di depan kelas tanpa error yang berguna.
      // Versi + checksum ada di public/vendor/VENDOR.md, dicek scripts/check-vendor.mjs.
      arBreadcrumb("AR boot: memuat vendor A-Frame/MindAR", { materi: materiId });
      await loadScript("/vendor/aframe-1.5.0.min.js");
      await loadScript("/vendor/mindar-image-aframe-1.2.5.prod.js");
      if (cancelled) return;

      setModelError(null);
      arBreadcrumb("AR engine start", { materi: materiId });
      const engine = new ArEngine(arConfig, {
        onGateUpdate: (done, total, unlockedNow) => setGate({ done, total, unlocked: unlockedNow }),
        onQuizReady: onAllExplored,
        onModelError: (targetKey, src) => {
          setModelError(`Model "${targetKey}" gagal dimuat (${src}).`);
          // Kirim ke Sentry dengan konteks materi/target → kelihatan walau
          // kejadiannya di HP siswa yang tak bisa kita reproduksi.
          captureArModelError({ materi: materiId, targetKey, src });
        },
        onNarrationChange: (playing, hasAudio) => setNarration({ playing, hasAudio }),
      });
      engineRef.current = engine;
      engine.start();
      setReady(true);

      // Sinkronkan panel/kontrol yang di-toggle imperatif oleh engine via observer ringan.
      const panelEl = document.getElementById("arPanel");
      const scanHintEl = document.getElementById("arScanHint");
      const reopenEl = document.getElementById("arReopenBtn");
      const viewControlsEl = document.getElementById("arViewControls");
      const moveControlsEl = document.getElementById("arMoveControls");

      const observer = new MutationObserver(() => {
        if (panelEl) setPanelHidden(panelEl.hidden);
        if (scanHintEl) setScanHintVisible(!scanHintEl.hidden);
        if (reopenEl) setReopenVisible(!reopenEl.hidden);
        if (viewControlsEl) setShowViewControls(!viewControlsEl.hidden);
        if (moveControlsEl) setShowMoveControls(!moveControlsEl.hidden);
      });
      [panelEl, scanHintEl, reopenEl, viewControlsEl, moveControlsEl].forEach((el) => {
        if (el) observer.observe(el, { attributes: true, attributeFilter: ["hidden"] });
      });

      return () => observer.disconnect();
    }

    const cleanupPromise = boot();

    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup?.());
      engineRef.current?.dispose();
      engineRef.current = null;
      // Jaring pengaman kalau engine keburu unmount sebelum sempat dibikin:
      // class dari A-Frame ini yang bikin halaman lain kekunci nggak bisa discroll.
      document.documentElement.classList.remove("a-fullscreen");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiId, restartToken]);

  // Ngulang boot() dari nol: dispose paksa stream kamera lama + rebuild scene,
  // biar user nggak perlu hard refresh browser kalau kamera macet.
  const restartCamera = () => {
    setReady(false);
    setModelError(null);
    setRestartToken((n) => n + 1);
  };

  const gateReady = gate.total > 0 && gate.done >= gate.total;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <header className="hairline fixed inset-x-0 top-0 z-30 flex items-center gap-4 bg-background/85 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => navigate({ to: "/materi" })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Kembali
        </button>
        <h1 className="font-display text-sm font-medium">{materiJudul}</h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={restartCamera}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" /> Kamera bermasalah?
          </button>
          <button
            onClick={() => navigate({ to: "/materi/$id/viewer", params: { id: materiId } })}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            title="Coba mode 3D tanpa kamera"
          >
            <Box className="h-4 w-4" /> Mode 3D
          </button>
        </div>
      </header>

      <div id="arSceneRoot" className="ar-scene-root fixed inset-0" />

      {modelError && (
        <div className="hairline fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-2xl bg-card px-4 py-2 text-center font-mono text-xs text-destructive">
          {modelError}
          <br />
          Cek console browser untuk detail error, atau tap &quot;Kamera bermasalah?&quot; buat coba lagi.
        </div>
      )}

      {!ready && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Memuat mode AR…
          </div>
        </div>
      )}

      {scanHintVisible && ready && (
        <div id="arScanHint" className="hairline fixed left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-background/85 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          Arahkan kamera ke gambar target di buku/kartu
        </div>
      )}
      {!scanHintVisible && <div id="arScanHint" hidden />}

      <button
        id="arReopenBtn"
        hidden={!reopenVisible}
        onClick={() => engineRef.current?.reopenPanel()}
        aria-label="Buka info lagi"
        className="hairline fixed bottom-24 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm"
      >
        <Info className="h-5 w-5" />
      </button>

      {/* Rail kontrol tunggal: kanan-tengah, sejangkauan jempol. Zoom + / - / Reset.
          Salin-View adalah alat kalibrasi dev, disembunyikan dari siswa. */}
      <div
        id="arViewControls"
        hidden={!showViewControls}
        className="hairline fixed right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 rounded-2xl bg-background/85 p-2 backdrop-blur-sm"
      >
        <button id="btnZoomIn" onClick={() => engineRef.current?.zoomIn()} aria-label="Perbesar model" className="flex h-10 w-10 items-center justify-center hover:bg-white/10">
          <Plus className="h-5 w-5" />
        </button>
        <button id="btnZoomOut" onClick={() => engineRef.current?.zoomOut()} aria-label="Perkecil model" className="flex h-10 w-10 items-center justify-center hover:bg-white/10">
          <Minus className="h-5 w-5" />
        </button>
        <div className="mx-1 my-0.5 h-px bg-border" />
        <button id="btnResetView" onClick={() => engineRef.current?.resetView()} aria-label="Reset tampilan" className="flex h-10 w-10 items-center justify-center hover:bg-white/10">
          <RotateCcw className="h-5 w-5" />
        </button>
        {showDevTools && (
          <button id="btnCopyView" onClick={() => engineRef.current?.copyCurrentView()} aria-label="Salin posisi kamera (dev)" title="DEV: salin posisi buat ditempel ke ar.json" className="flex h-10 w-10 items-center justify-center text-primary hover:bg-white/10">
            <Ruler className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* D-pad geser hanya untuk dev/kalibrasi; siswa cukup drag untuk memutar. */}
      {showDevTools && (
        <div
          id="arMoveControls"
          hidden={!showMoveControls}
          className="hairline fixed bottom-24 left-4 z-20 grid grid-cols-3 gap-1 rounded-2xl bg-background/85 p-2 backdrop-blur-sm"
        >
          <span />
          <button id="btnMoveUp" onClick={() => engineRef.current?.moveUp()} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10"><ArrowUp className="h-4 w-4" /></button>
          <span />
          <button id="btnMoveLeft" onClick={() => engineRef.current?.moveLeft()} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></button>
          <span />
          <button id="btnMoveRight" onClick={() => engineRef.current?.moveRight()} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10"><ArrowRight className="h-4 w-4" /></button>
          <span />
          <button id="btnMoveDown" onClick={() => engineRef.current?.moveDown()} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10"><ArrowDown className="h-4 w-4" /></button>
          <span />
        </div>
      )}

      <div id="arCopyToast" hidden className="hairline fixed bottom-4 left-1/2 z-30 -translate-x-1/2 whitespace-pre rounded-xl bg-card px-4 py-2 font-mono text-xs" />

      {/* Bottom sheet. Default "peek" (pendek) supaya area scan/model lega di HP,
          ini fix "kepotong, nggak full layar". Tap gagang buat lebarin. Semua
          elemen ber-id TETAP di DOM (di-collapse pakai display:none), jadi engine
          imperatif yang pakai getElementById tetap jalan. */}
      <div
        id="arPanel"
        ref={panelRef}
        hidden={panelHidden}
        style={{ transform: `translateY(${sheetOffset}px)` }}
        className="hairline fixed inset-x-0 bottom-0 z-20 flex max-h-[80vh] flex-col rounded-t-xl bg-card pb-[env(safe-area-inset-bottom)] touch-none"
      >
        <button
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          aria-label="Tarik untuk menggeser panel, tap untuk buka/tutup detail"
          title="Tarik untuk menggeser panel"
          className="mx-auto mt-2 flex h-8 w-full max-w-[160px] cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-white/25" />
        </button>

        <div className="flex items-center justify-between gap-2 px-5">
          <h2 id="arPanelTitle" data-panel-title className="min-w-0 flex-1 truncate font-display text-lg font-medium">
            …
          </h2>
          <button
            onClick={() => engineRef.current?.toggleNarration()}
            disabled={!narration.hasAudio}
            aria-label={narration.playing ? "Jeda narasi" : "Putar narasi"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {narration.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button id="arPanelClose" onClick={() => engineRef.current?.closePanel()} aria-label="Tutup panel" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div id="arHotspotRow" data-hotspot-row className="mt-3 flex flex-wrap gap-2 empty:hidden [&_.ar-hotspot-pill]:inline-flex [&_.ar-hotspot-pill]:items-center [&_.ar-hotspot-pill]:gap-1.5 [&_.ar-hotspot-pill]:rounded-full [&_.ar-hotspot-pill]:border [&_.ar-hotspot-pill]:border-border [&_.ar-hotspot-pill]:bg-background/40 [&_.ar-hotspot-pill]:px-3 [&_.ar-hotspot-pill]:py-1.5 [&_.ar-hotspot-pill]:text-xs [&_.ar-hotspot-pill.is-active]:bg-primary [&_.ar-hotspot-pill.is-active]:text-primary-foreground [&_.ar-hotspot-pill.is-visited-pill]:border-success/60 [&_.ar-hotspot-pill:disabled]:opacity-40 [&_.ar-hotspot-pill-index]:font-mono [&_.ar-hotspot-pill-index]:text-[0.65rem] [&_.ar-hotspot-pill-index]:opacity-60" />

          {/* Bagian panjang: disembunyikan saat panel di-peek biar model AR keliatan. */}
          <div className={panelExpanded ? "" : "hidden"} data-panel-body>
            <p id="arPanelDesc" data-panel-desc className="mt-3 text-sm leading-relaxed text-muted-foreground [&:not(.is-expanded)]:line-clamp-3">
              …
            </p>
            <button
              id="arDescToggle"
              data-desc-toggle
              hidden
              onClick={() => engineRef.current?.toggleDesc()}
              className="mt-1 text-xs font-medium text-primary"
            >
              Baca selengkapnya ▾
            </button>

            <div id="arProgressDots" className="mt-4 flex gap-1.5 [&_.ar-dot]:h-1.5 [&_.ar-dot]:w-1.5 [&_.ar-dot]:rounded-full [&_.ar-dot]:bg-white/15 [&_.ar-dot.is-visited]:bg-primary" />
          </div>

          <button
            id="btnKeQuiz"
            disabled={!gateReady}
            onClick={() => gateReady && navigate({ to: "/quiz/$id", params: { id: materiId } })}
            className="mt-5 w-full rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
          >
            {gateReady ? "Lanjut ke Quiz →" : `🔒 Jelajahi semua bagian dulu (${gate.done}/${gate.total || "…"})`}
          </button>
          <p id="arGateNote" className={`mt-2 text-center text-xs text-muted-foreground ${panelExpanded ? "" : "hidden"}`}>
            {gateReady
              ? "Semua bagian sudah dijelajahi. Mantap!"
              : gate.total
                ? `Sisa ${gate.total - gate.done} bagian lagi yang belum di-tap.`
                : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
