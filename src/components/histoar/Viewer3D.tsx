// Fallback tanpa kamera dari ArScan.tsx - buat HP yang kameranya bermasalah/
// rusak. Model materi ditampilkan langsung (tanpa nunggu marker ke-scan),
// diputar/di-zoom/di-geser lewat drag & tombol yang PERSIS sama kayak mode AR
// (lihat ArEngine mode "viewer3d" di ar-engine.ts) - jadi UI di bawah ini
// sengaja banyak nyalin ArScan.tsx apa adanya (id elemen sama, karena ArEngine
// masih cari elemen lewat getElementById, dan kelas desain yang sama biar
// konsisten), cuma bagian kamera/scan-hint yang dibuang.
//
// Di layar lebar (>=1024px) tampilannya berubah total jadi 3 panel (kiri:
// daftar hotspot, tengah: model, kanan: pembahasan + CTA) sesuai referensi
// desain user - tapi arsitekturnya TETAP satu scene fullscreen ("#arSceneRoot"
// fixed inset-0") dengan panel-panel MENGAMBANG di atasnya, persis pola yang
// sudah dipakai mobile, cuma nambah panel baru di breakpoint lg. Elemen yang
// ditulis ArEngine (judul/hotspot-list/deskripsi) sengaja DIBUAT DUA KALI di
// DOM - versi mobile (id lama, dipakai CSS lama) dan versi desktop (data-*
// attribute yang sama) - karena ArEngine sekarang broadcast ke SEMUA elemen
// yang cocok, bukan cuma satu id (lihat qAll() di ar-engine.ts). Di bawah
// 1024px, panel desktop di-"hidden lg:flex" sehingga gak pernah dirender ke
// DOM sama sekali... err, tetap dirender tapi disembunyikan CSS - tetap aman
// karena ArEngine cuma nulis textContent/innerHTML, gak masalah kalau target
// elemennya lagi display:none.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { loadScript } from "@/lib/load-script";
import { ArEngine } from "@/lib/ar-engine";
import { arBreadcrumb, captureArModelError } from "@/lib/monitoring";
import type { ArMateriConfig } from "@/lib/histoar-types";
import { CaveArtMotif } from "@/components/cave-art-motif";
import {
  ChevronLeft,
  Plus,
  Minus,
  RotateCcw,
  Ruler,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  Info,
  Play,
  Pause,
} from "lucide-react";

export function Viewer3D({
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
  const [showViewControls, setShowViewControls] = useState(false);
  const [showMoveControls, setShowMoveControls] = useState(false);
  const [panelHidden, setPanelHidden] = useState(true);
  // Beda dari ArScan.tsx: mode ini TIDAK punya kamera live buat dilindungi,
  // jadi gak ada alasan mulai collapsed - deskripsi langsung kebuka begitu
  // panel muncul (baik intro maupun pas pilih hotspot), gak perlu tarik manual.
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [reopenVisible, setReopenVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const dragState = useRef<{ startY: number; startOffset: number; max: number; moved: boolean } | null>(null);
  // Chip/baris aktif di pemilih target - murni buat highlight visual, engine
  // yang pegang state sesungguhnya. Target pertama otomatis aktif begitu
  // engine start().
  const [activeTargetKey, setActiveTargetKey] = useState(arConfig.targets[0]?.key ?? "");
  const [narration, setNarration] = useState({ playing: false, hasAudio: false });

  const onHandleDown = (e: React.PointerEvent) => {
    const h = panelRef.current?.getBoundingClientRect().height ?? 0;
    dragState.current = {
      startY: e.clientY,
      startOffset: sheetOffset,
      max: Math.max(0, h - 120),
      moved: false,
    };
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
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* tidak pernah ter-capture; abaikan */
    }
    if (d && !d.moved) setPanelExpanded((v) => !v);
  };
  const [gate, setGate] = useState({ done: 0, total: 0, unlocked: false });
  const [modelError, setModelError] = useState<string | null>(null);
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
      // Cuma A-Frame yang dibutuhin di sini - vendor mindar-image sengaja TIDAK
      // dimuat sama sekali, mode ini gak pernah nyentuh kamera/tracking.
      arBreadcrumb("Viewer3D boot: memuat vendor A-Frame", { materi: materiId });
      await loadScript("/vendor/aframe-1.5.0.min.js");
      if (cancelled) return;

      setModelError(null);
      arBreadcrumb("Viewer3D engine start", { materi: materiId });
      const engine = new ArEngine(
        arConfig,
        {
          onGateUpdate: (done, total, unlockedNow) => setGate({ done, total, unlocked: unlockedNow }),
          onQuizReady: onAllExplored,
          onModelError: (targetKey, src) => {
            setModelError(`Model "${targetKey}" gagal dimuat (${src}).`);
            captureArModelError({ materi: materiId, targetKey, src });
          },
          onNarrationChange: (playing, hasAudio) => setNarration({ playing, hasAudio }),
        },
        "viewer3d",
      );
      engineRef.current = engine;
      engine.start();
      setReady(true);

      const panelEl = document.getElementById("arPanel");
      const reopenEl = document.getElementById("arReopenBtn");
      const viewControlsEl = document.getElementById("arViewControls");
      const moveControlsEl = document.getElementById("arMoveControls");

      const observer = new MutationObserver(() => {
        if (panelEl) setPanelHidden(panelEl.hidden);
        if (reopenEl) setReopenVisible(!reopenEl.hidden);
        if (viewControlsEl) setShowViewControls(!viewControlsEl.hidden);
        if (moveControlsEl) setShowMoveControls(!moveControlsEl.hidden);
      });
      [panelEl, reopenEl, viewControlsEl, moveControlsEl].forEach((el) => {
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
      document.documentElement.classList.remove("a-fullscreen");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiId]);

  const gateReady = gate.total > 0 && gate.done >= gate.total;
  const hasMultipleTargets = arConfig.targets.length > 1;
  const gateLabel = gateReady
    ? "Lanjut ke Quiz →"
    : `Jelajahi semua bagian dulu (${gate.done}/${gate.total || "…"})`;
  const selectTarget = (key: string) => {
    engineRef.current?.selectTarget(key);
    setActiveTargetKey(key);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background lg:h-screen">
      {/* Motif lukisan gua ala landing page - khusus layar lebar, biar viewer
          3D gak polos kotak hitam. Di HP tetap hitam solid (konsisten sama
          letterbox kamera AR, dan biar model kecil gak tenggelam di tekstur). */}
      <div className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden lg:block">
        <div
          className="absolute -top-1/4 left-1/4 h-[70vh] w-[70vh] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.58 0.09 175 / 0.14), transparent 65%)" }}
        />
        <div
          className="absolute bottom-0 right-0 h-[60vh] w-[60vh] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.94 0.006 75 / 0.05), transparent 65%)" }}
        />
        <CaveArtMotif />
      </div>

      <header className="hairline fixed inset-x-0 top-0 z-30 flex items-center gap-4 bg-background/85 px-4 py-3 backdrop-blur-sm lg:inset-x-6 lg:top-4 lg:rounded-full lg:border lg:border-border lg:bg-card/90 lg:px-5 lg:py-2.5">
        <button
          onClick={() => navigate({ to: "/materi/$id", params: { id: materiId } })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Kembali
        </button>
        <h1 className="font-display text-sm font-medium">{materiJudul}</h1>
        <span className="ml-auto text-xs text-muted-foreground">Mode 3D · tanpa kamera</span>
      </header>

      <div id="arSceneRoot" className="ar-scene-root viewer3d-desktop fixed inset-0 z-[1]" />

      {/* Pemilih target: versi chip mengambang buat mobile (satu-satunya
          panel yang ada di sana), diganti daftar di sidebar kiri untuk
          desktop (lihat "EKSPLORASI" di bawah) - keduanya panggil
          selectTarget() yang sama. Cuma tampil kalau materi ini beneran
          punya lebih dari satu target/marker (jarang - kebanyakan materi
          cuma satu target dengan banyak hotspot). */}
      {hasMultipleTargets && ready && (
        <div className="hairline fixed left-1/2 top-16 z-20 flex max-w-[92vw] -translate-x-1/2 gap-1.5 overflow-x-auto rounded-full bg-background/85 px-2 py-1.5 backdrop-blur-sm lg:hidden">
          {arConfig.targets.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTarget(t.key)}
              className={
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition " +
                (activeTargetKey === t.key
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:bg-white/10")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {modelError && (
        <div className="hairline fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-2xl bg-card px-4 py-2 text-center font-mono text-xs text-destructive">
          {modelError}
          <br />
          Cek console browser untuk detail error.
        </div>
      )}

      {!ready && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Memuat model 3D…
          </div>
        </div>
      )}

      {/* ================= SIDEBAR KIRI (desktop, >=1024px) — "MATERI" ================= */}
      <aside className="hairline fixed left-6 top-24 bottom-6 z-20 hidden w-[260px] flex-col overflow-y-auto rounded-2xl bg-card/80 p-5 backdrop-blur-md lg:flex">
        <p className="catalog-label">Materi</p>
        <div
          data-hotspot-row
          className="mt-3 flex flex-col gap-1 empty:hidden
            [&_.ar-hotspot-pill]:flex [&_.ar-hotspot-pill]:w-full [&_.ar-hotspot-pill]:items-baseline [&_.ar-hotspot-pill]:gap-2.5
            [&_.ar-hotspot-pill]:rounded-xl [&_.ar-hotspot-pill]:border [&_.ar-hotspot-pill]:border-transparent
            [&_.ar-hotspot-pill]:px-3 [&_.ar-hotspot-pill]:py-2.5 [&_.ar-hotspot-pill]:text-left [&_.ar-hotspot-pill]:text-sm [&_.ar-hotspot-pill]:transition
            [&_.ar-hotspot-pill:hover]:bg-white/5
            [&_.ar-hotspot-pill.is-active]:border-primary/30 [&_.ar-hotspot-pill.is-active]:bg-primary/10
            [&_.ar-hotspot-pill:not(.is-visited-pill)]:text-muted-foreground [&_.ar-hotspot-pill.is-visited-pill]:text-foreground
            [&_.ar-hotspot-pill:disabled]:opacity-40
            [&_.ar-hotspot-pill-index]:font-mono [&_.ar-hotspot-pill-index]:text-xs [&_.ar-hotspot-pill-index]:text-muted-foreground
            [&_.ar-hotspot-pill-label]:font-medium"
        />

        {hasMultipleTargets && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="catalog-label">Eksplorasi</p>
            <div className="mt-3 flex flex-col gap-0.5">
              {arConfig.targets.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => selectTarget(t.key)}
                  className={
                    "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition " +
                    (activeTargetKey === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <span
                    className={
                      "h-2 w-2 shrink-0 rounded-full border " +
                      (activeTargetKey === t.key ? "border-primary bg-primary" : "border-border")
                    }
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ================= TOOLBAR BAWAH (desktop) ================= */}
      <div className="hairline fixed bottom-6 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-1 rounded-full bg-card/90 px-2 py-1.5 backdrop-blur-md lg:flex">
        <ToolbarButton icon={<RotateCcw className="h-4 w-4" />} label="Putar" onClick={() => engineRef.current?.resetView()} />
        <ToolbarButton icon={<Plus className="h-4 w-4" />} label="Perbesar" onClick={() => engineRef.current?.zoomIn()} />
        <ToolbarButton icon={<Minus className="h-4 w-4" />} label="Perkecil" onClick={() => engineRef.current?.zoomOut()} />
        <ToolbarButton
          icon={narration.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          label="Narasi"
          onClick={() => engineRef.current?.toggleNarration()}
          disabled={!narration.hasAudio}
        />
        {showDevTools && (
          <ToolbarButton
            icon={<Ruler className="h-4 w-4" />}
            label="Salin (dev)"
            onClick={() => engineRef.current?.copyCurrentView()}
            accent
          />
        )}
      </div>

      {/* ================= SIDEBAR KANAN (desktop) — "PEMBAHASAN" ================= */}
      <aside className="hairline fixed right-6 top-24 bottom-6 z-20 hidden w-[340px] flex-col overflow-y-auto rounded-2xl bg-card/80 p-6 backdrop-blur-md lg:flex" data-panel-body>
        <p className="catalog-label">Pembahasan</p>
        <h2 data-panel-title className="mt-2 font-display text-xl font-semibold leading-snug">
          …
        </h2>
        <p data-panel-desc className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
          …
        </p>

        <div className="mt-6 shrink-0 space-y-2 border-t border-border pt-5">
          <button
            disabled={!gateReady}
            onClick={() => gateReady && navigate({ to: "/quiz/$id", params: { id: materiId } })}
            className="w-full rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
          >
            {gateLabel}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            {gateReady ? "Semua bagian sudah dijelajahi. Mantap!" : gate.total ? `${gate.done}/${gate.total} bagian dijelajahi` : ""}
          </p>
        </div>
      </aside>

      {/* ================= MOBILE (<1024px) — bottom sheet & rail lama, TIDAK berubah ================= */}
      <button
        id="arReopenBtn"
        hidden={!reopenVisible}
        onClick={() => engineRef.current?.reopenPanel()}
        aria-label="Buka info lagi"
        className="hairline fixed bottom-24 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm lg:hidden"
      >
        <Info className="h-5 w-5" />
      </button>

      <div
        id="arViewControls"
        hidden={!showViewControls}
        className="hairline fixed right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 rounded-2xl bg-background/85 p-2 backdrop-blur-sm lg:hidden"
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

      {showDevTools && (
        <div
          id="arMoveControls"
          hidden={!showMoveControls}
          className="hairline fixed bottom-24 left-4 z-20 grid grid-cols-3 gap-1 rounded-2xl bg-background/85 p-2 backdrop-blur-sm lg:hidden"
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

      <div
        id="arPanel"
        ref={panelRef}
        hidden={panelHidden}
        style={{ transform: `translateY(${sheetOffset}px)` }}
        className="hairline fixed inset-x-0 bottom-0 z-20 flex max-h-[80vh] flex-col rounded-t-xl bg-card pb-[env(safe-area-inset-bottom)] touch-none lg:hidden"
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
            {gateLabel}
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

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 " +
        (accent ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-white/10 hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}
