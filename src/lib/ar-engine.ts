// Port dari assets/js/ar-controller.js jadi class TS yang bisa di-mount/unmount
// dengan aman dari React (state jadi instance property, bukan module-level).
//
// A-Frame & MindAR pada dasarnya library imperatif berbasis custom element,
// jadi bagian ini sengaja tetap manipulasi DOM langsung (lewat id yang sama
// dengan markup di ArScan.tsx) alih-alih dipaksa jadi "React murni".

import type { ArHotspotView, ArMateriConfig, ArTarget } from "@/lib/histoar-types";

declare global {
  interface Window {
    AFRAME: any;
    THREE: any;
  }
}

const AUDIO_LOCK_TIMEOUT_MS = 12000;
// SATUAN ZOOM = KELIPATAN LEBAR MARKER.
//
// Dulu ukuran model = `scale` (selalu "0.3 0.3 0.3") x `zoom`, dikalikan ke GLB
// yang ukuran aslinya beda ekstrem antar materi (maxDim 0.21 buat crop kepala
// s/d 25.2 buat diorama Zaman Logam). Akibatnya `zoom` jadi angka sakti tanpa
// makna fisik: kepala butuh 26, badan cukup 2.8, dan salah sedikit bikin kamera
// masuk KE DALAM model (yang kelihatan cuma dinding tekstur, dan +/- terasa
// menggeser bukan membesar).
//
// Sekarang engine mengukur sendiri bounding box tiap GLB saat dimuat lalu
// menormalkannya (lihat normalizeModel), jadi:
//     zoom 1.0  = sisi terpanjang model == lebar marker
//     zoom 0.85 = muat utuh dengan sedikit margin  <- default
// Angka ini otomatis benar untuk model baru tanpa kalibrasi tangan.
const ZOOM_MULT = 1.18;
const MIN_ZOOM = 0.2;
const DEFAULT_MAX_ZOOM = 4;
const ROTATE_SPEED = 0.4;
const MOVE_STEP = 0.02;
// Batas tilt (rotX) saat allowTiltDrag aktif - dijaga jauh dari ±90° biar model
// nggak pernah "kebalik" (gimbal terasa aneh) walau jari ditarik jauh melewati
// tepi layar.
const TILT_DRAG_MAX = 80;

// Resolusi kamera yang diminta ke getUserMedia. MindAR sendiri cuma minta
// `{ facingMode: "environment" }`, dan default browser HP itu 640x480 LANDSCAPE.
// Di layar HP portrait (rasio ~0.46) frame landscape itu kepotong parah, makanya
// kita minta stream yang orientasinya ngikut layar. Angkanya sengaja 540x960
// (bukan 720x1280): tracking MindAR jalan per-frame di CPU/GPU HP siswa, jadi
// jumlah piksel ditahan biar nggak drop frame.
const CAM_LONG_EDGE = 960;
const CAM_SHORT_EDGE = 540;

function ensureAutoplayComponent() {
  const AFRAME = window.AFRAME;
  if (!AFRAME || AFRAME.components["autoplay-animations"]) return;
  AFRAME.registerComponent("autoplay-animations", {
    // Default "all": muterin semua klip (perilaku lama, cocok buat model yang
    // cuma punya 1 klip). "idle": buat model yang punya banyak klip sekaligus
    // (Idle/Walk/Run/Attack/Death) supaya gak numpuk/glitch rebutan tulang yang
    // sama. "none": jangan mainkan klip apa pun, biarkan bind pose (T-pose)
    // statis -- dipakai khusus homo-sapiens.glb.
    schema: { mode: { type: "string", default: "all" } },
    init: function (this: any) {
      this.mixer = null;
      if (this.data.mode === "none") return;
      this.el.addEventListener("model-loaded", (e: any) => {
        const model = e.detail.model;
        const animations = model.animations;
        if (!animations || !animations.length) return;
        this.mixer = new window.THREE.AnimationMixer(model);
        if (this.data.mode === "idle") {
          const idleClip =
            animations.find((clip: any) => /idle/i.test(clip.name)) ?? animations[0];
          this.mixer.clipAction(idleClip).play();
        } else {
          animations.forEach((clip: any) => this.mixer.clipAction(clip).play());
        }
      });
    },
    tick: function (this: any, _t: number, dt: number) {
      if (this.mixer) this.mixer.update(dt / 1000);
    },
  });
}

/**
 * Patch preview kamera MindAR biar area scan TIDAK kepotong di HP.
 *
 * Dua masalah bawaan MindAR 1.2.5 yang diperbaiki di sini:
 *
 * 1. `_startVideo()` minta kamera tanpa constraint resolusi -> browser HP kasih
 *    640x480 (landscape). Kita minta stream yang orientasinya ngikut layar.
 * 2. `_resize()` nge-scale video pakai strategi COVER: sisi pendek video dipaksa
 *    nutup layar, sisanya meluber keluar viewport. Di HP portrait dengan kamera
 *    landscape, ~65% lebar frame kamera ada DI LUAR layar - siswa nggak bisa
 *    lihat marker yang lagi mereka arahkan. Kita ganti jadi CONTAIN (fit):
 *    seluruh frame kamera kelihatan, sisanya jadi bar hitam (lihat .ar-scene-root).
 *
 * Rumus fov/near/far dipertahankan persis dari MindAR - rumusnya memang sudah
 * relatif terhadap ukuran tampil video (`h`), jadi tetap presisi untuk contain
 * maupun cover selama skalanya uniform.
 *
 * Di-patch di level prototype system supaya tidak bergantung timing init A-Frame.
 */
function ensureCameraFitPatch() {
  const AFRAME = window.AFRAME;
  const System = AFRAME?.systems?.["mindar-image-system"];
  const proto = System?.prototype;
  if (!proto || proto.__histoarCameraPatched) return;
  proto.__histoarCameraPatched = true;

  proto._startVideo = function (this: any) {
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.style.position = "absolute";
    video.style.top = "0px";
    video.style.left = "0px";
    video.style.zIndex = "-2";
    this.video = video;
    this.container.appendChild(video);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.el.emit("arError", { error: "VIDEO_FAIL" });
      this.ui.showCompatibility();
      return;
    }

    const portrait = this.container.clientHeight >= this.container.clientWidth;
    const wanted: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: "environment",
        width: { ideal: portrait ? CAM_SHORT_EDGE : CAM_LONG_EDGE },
        height: { ideal: portrait ? CAM_LONG_EDGE : CAM_SHORT_EDGE },
      },
    };

    navigator.mediaDevices
      .getUserMedia(wanted)
      // Sebagian HP/browser nolak constraint resolusi (OverconstrainedError).
      // Jangan sampai AR gagal total cuma gara-gara itu - balik ke request polos.
      // Error izin TIDAK di-retry: percuma, dan malah bisa munculin prompt dua kali.
      .catch((err: DOMException) => {
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") throw err;
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } });
      })
      .then((stream) => {
        video.addEventListener("loadedmetadata", () => {
          video.setAttribute("width", String(video.videoWidth));
          video.setAttribute("height", String(video.videoHeight));
          this._startAR();
        });
        video.srcObject = stream;
      })
      .catch((err) => {
        console.error("[ArEngine] getUserMedia error", err);
        this.el.emit("arError", { error: "VIDEO_FAIL" });
      });
  };

  // MindAR `stop()` -> `pause()` nembak `this.controller.stopProcessVideo()` dan
  // `this.video.srcObject.getTracks()` tanpa penjagaan. Kalau kamera GAGAL start
  // (izin ditolak, kamera dipakai aplikasi lain, HP tanpa kamera belakang),
  // controller/srcObject nggak pernah ada -> begitu user nekan "Kembali",
  // A-Frame manggil remove() komponen `mindar-image` -> stop() -> TypeError yang
  // NGGAK KETANGKEP (lolos dari try/catch di dispose() karena datang lewat
  // disconnectedCallback, bukan dari panggilan kita). Efeknya: exception merah di
  // HP siswa + noise di Sentry, persis pas mereka lagi kesulitan.
  proto.pause = function (this: any, keepVideo?: boolean) {
    if (!keepVideo) this.video?.pause?.();
    this.controller?.stopProcessVideo?.();
  };
  proto.stop = function (this: any) {
    this.pause();
    (this.video?.srcObject as MediaStream | undefined)?.getTracks?.().forEach((t) => t.stop());
    this.video?.remove?.();
    this.controller?.dispose?.();
  };

  proto._resize = function (this: any) {
    const video = this.video;
    const container = this.container;
    if (!video || !container || !this.controller) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch || !video.videoWidth || !video.videoHeight) return;

    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = cw / ch;

    // CONTAIN: muat seluruh frame kamera ke dalam layar (jangan crop).
    let w: number;
    let h: number;
    if (videoRatio > containerRatio) {
      w = cw;
      h = w / videoRatio;
    } else {
      h = ch;
      w = h * videoRatio;
    }

    const proj = this.controller.getProjectionMatrix();
    const fov = ((2 * Math.atan((1 / proj[5]) * (ch / h))) * 180) / Math.PI;
    const near = proj[14] / (proj[10] - 1);
    const far = proj[14] / (proj[10] + 1);

    const camera = container.getElementsByTagName("a-camera")[0]?.getObject3D("camera");
    if (camera) {
      camera.fov = fov;
      camera.aspect = containerRatio;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    video.style.top = `${-(h - ch) / 2}px`;
    video.style.left = `${-(w - cw) / 2}px`;
    video.style.width = `${w}px`;
    video.style.height = `${h}px`;
  };
}

export interface ArEngineCallbacks {
  onGateUpdate: (done: number, total: number, ready: boolean) => void;
  onQuizReady: () => void;
  onModelError?: (targetKey: string, src: string, detail: unknown) => void;
  // Dipanggil tiap kali status play/pause audio narasi berubah - dipakai buat
  // tombol "Narasi" di layout desktop viewer3D (mobile gak punya tombol ini,
  // audio langsung autoplay saat hotspot dipilih).
  onNarrationChange?: (playing: boolean, hasAudio: boolean) => void;
}

// "camera" = mode AR biasa (MindAR + video kamera, marker fisik).
// "viewer3d" = fallback tanpa kamera buat HP yang kameranya bermasalah: model
// langsung ditampilkan (tidak nunggu marker ke-scan), muter/zoom/pan lewat
// drag & tombol persis kayak AR, cuma tanpa mindar-image sama sekali.
export type ArEngineMode = "camera" | "viewer3d";

export class ArEngine {
  private config: ArMateriConfig;
  private callbacks: ArEngineCallbacks;
  private mode: ArEngineMode;
  private visited = new Set<string>();
  private currentAudio: HTMLAudioElement | null = null;
  private audioBusy = false;
  private audioTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private activeTarget: ArTarget | null = null;
  // State "target ini udah pernah ketemu" WAJIB per-instance. Dulu disimpen
  // sebagai t._locked di object config-nya langsung, padahal config itu berasal
  // dari import ar.json = objek module-level yang hidup terus selama tab kebuka.
  // Efeknya: masuk AR untuk kedua kalinya (tanpa reload) targetFound dianggap
  // "bukan pertama kali", openPanel() nggak pernah jalan, jadi defaultView
  // (zoom) nggak keterapin dan panel + audio intro nggak muncul.
  private openedTargets = new Set<string>();
  private trackingKey: string | null = null;
  private maxZoom = DEFAULT_MAX_ZOOM;
  // 1 / sisi-terpanjang model yang sedang tampil. Dihitung ulang tiap GLB
  // selesai dimuat (normalizeModel), jadi zoomFactor selalu berarti sama
  // untuk semua model. Nilai 1 dipakai sampai ukuran aslinya diketahui.
  private modelUnitScale = 1;
  private zoomFactor = 1;
  private rotY = 0;
  private rotX = 0;
  private moveX = 0;
  private moveY = 0;
  // TITIK FOKUS KAMERA, dinyatakan sebagai FRAKSI ukuran model (origin = pusat
  // model, jadi -0.5..0.5 kira-kira mencakup seluruh model). Titik inilah yang
  // dibawa ke pusat marker, sehingga "pindah hotspot = pindah viewport": kamera
  // seolah bergeser lalu mendekat ke satu bagian diorama, bukan dioramanya yang
  // digelembungkan di tempat.
  private focus = { x: 0, y: 0, z: 0 };
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private disposed = false;

  // bound handlers supaya bisa di-removeEventListener saat dispose()
  private onPointerDown = (e: PointerEvent) => {
    if (!this.activeTarget) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || !this.activeTarget) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.rotY += dx * ROTATE_SPEED;
    // Default: drag vertikal tidak melakukan apa-apa (perilaku lama, tetap
    // dipakai semua materi lain di mode kamera). Materi yang butuh lihat model
    // dari atas (mis. m3-0 "Ragam Temuan" - Ekskavasi Digital) mengaktifkan
    // `allowTiltDrag` di ar.json supaya drag atas-bawah ikut memutar sumbu X.
    // Mode viewer3d SELALU boleh tilt bebas - tidak ada kartu marker fisik
    // yang membatasi orientasi "wajar"-nya, jadi orbit penuh yang diharapkan.
    if (this.mode === "viewer3d" || this.config.allowTiltDrag) {
      const nextRotX = this.rotX - dy * ROTATE_SPEED;
      this.rotX = Math.min(TILT_DRAG_MAX, Math.max(-TILT_DRAG_MAX, nextRotX));
    } else {
      this.rotX = 0;
    }
    this.applyWrapperTransform(this.activeTarget.key);
  };
  private onPointerUp = () => {
    this.dragging = false;
  };

  constructor(config: ArMateriConfig, callbacks: ArEngineCallbacks, mode: ArEngineMode = "camera") {
    this.config = config;
    this.callbacks = callbacks;
    this.mode = mode;
    this.maxZoom = typeof config.maxZoom === "number" ? config.maxZoom : DEFAULT_MAX_ZOOM;
  }

  private q<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  // Sebagian elemen (judul/hotspot-list/deskripsi) tampil DUA KALI di DOM
  // sekaligus - satu versi mobile (bottom-sheet, dicari lewat id lama biar
  // CSS lama tetap jalan), satu versi desktop (sidebar kiri/kanan, muncul di
  // viewport lebar lewat CSS, lihat Viewer3D.tsx). Keduanya ditandai atribut
  // data-* yang sama, jadi satu kali tulis di sini otomatis nyampe ke
  // dua-duanya tanpa engine perlu tahu ada berapa banyak yang sedang dirender.
  private qAll<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return Array.from(document.querySelectorAll<T>(selector));
  }

  private emitNarrationState() {
    const audio = this.currentAudio;
    this.callbacks.onNarrationChange?.(!!audio && !audio.paused, !!audio);
  }

  private totalHotspotCount() {
    return this.config.targets.reduce((sum, t) => sum + t.hotspots.length, 0);
  }

  private updateGateButton() {
    const total = this.totalHotspotCount();
    const done = this.visited.size;
    this.callbacks.onGateUpdate(done, total, done >= total);
  }

  private playIntroAudio(src?: string) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    if (!src) {
      this.currentAudio = null;
      this.emitNarrationState();
      return;
    }
    this.currentAudio = new Audio(src);
    ["play", "pause", "ended"].forEach((ev) => this.currentAudio!.addEventListener(ev, () => this.emitNarrationState()));
    this.currentAudio.play().catch(() => {});
    this.emitNarrationState();
  }

  private lockHotspots() {
    this.audioBusy = true;
    document
      .querySelectorAll(".ar-hotspot-pill")
      .forEach((el) => el.setAttribute("disabled", "true"));
  }

  private unlockHotspots() {
    this.audioBusy = false;
    document.querySelectorAll(".ar-hotspot-pill").forEach((el) => el.removeAttribute("disabled"));
  }

  private playNarrationAudio(src: string | undefined, onEnded: (() => void) | null) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    if (this.audioTimeoutHandle) clearTimeout(this.audioTimeoutHandle);

    if (!src) {
      this.currentAudio = null;
      this.unlockHotspots();
      this.emitNarrationState();
      onEnded?.();
      return;
    }

    this.lockHotspots();
    this.currentAudio = new Audio(src);
    ["play", "pause"].forEach((ev) => this.currentAudio!.addEventListener(ev, () => this.emitNarrationState()));

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (this.audioTimeoutHandle) clearTimeout(this.audioTimeoutHandle);
      this.unlockHotspots();
      this.emitNarrationState();
      onEnded?.();
    };

    this.currentAudio.addEventListener("ended", finish, { once: true });
    this.currentAudio.addEventListener("error", finish, { once: true });
    this.audioTimeoutHandle = setTimeout(finish, AUDIO_LOCK_TIMEOUT_MS);
    this.currentAudio.play().catch(finish);
    this.emitNarrationState();
  }

  /** Viewer3D saja: play/pause manual narasi hotspot yang sedang aktif. */
  toggleNarration = () => {
    if (!this.currentAudio) return;
    if (this.currentAudio.paused) this.currentAudio.play().catch(() => {});
    else this.currentAudio.pause();
  };

  private applyWrapperTransform(targetKey: string) {
    const sceneRoot = this.q("arSceneRoot");
    const wrapper = sceneRoot?.querySelector(`[data-wrapper="${targetKey}"]`);
    if (!wrapper) return;
    const s = this.modelUnitScale * this.zoomFactor;

    // Geser wrapper supaya titik fokus mendarat tepat di pusat marker.
    // Offset dunia = rotY(focus x zoom). Perhatikan TIDAK ada modelUnitScale di
    // sini: karena focus dinyatakan sebagai fraksi ukuran model, faktor itu
    // saling meniadakan. Efeknya titik fokus tetap terkunci di tengah walau
    // di-zoom atau diputar - persis kamera yang di-dolly.
    const rad = (this.rotY * Math.PI) / 180;
    const fx = this.focus.x * this.zoomFactor;
    const fz = this.focus.z * this.zoomFactor;
    const offX = fx * Math.cos(rad) + fz * Math.sin(rad);
    const offZ = -fx * Math.sin(rad) + fz * Math.cos(rad);
    const offY = this.focus.y * this.zoomFactor;

    // CATATAN: moveY sekarang sumbu Y (vertikal). Dulu dipetakan ke Z (kedalaman),
    // jadi D-pad atas/bawah tidak pernah bisa menggeser tampilan naik-turun.
    wrapper.setAttribute("position", `${this.moveX - offX} ${this.moveY - offY} ${-offZ}`);
    wrapper.setAttribute("scale", `${s} ${s} ${s}`);
    wrapper.setAttribute("rotation", `${this.rotX} ${this.rotY} 0`);
  }

  /** Balikin transform ke titik awal; ukuran diurus modelUnitScale. */
  private resetTransform(targetKey: string) {
    this.zoomFactor = 1;
    this.rotY = 0;
    this.rotX = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.focus = { x: 0, y: 0, z: 0 };
    this.applyWrapperTransform(targetKey);
  }

  zoomIn = () => {
    if (!this.activeTarget) return;
    this.zoomFactor = Math.min(this.maxZoom, +(this.zoomFactor * ZOOM_MULT).toFixed(2));
    this.applyWrapperTransform(this.activeTarget.key);
  };

  zoomOut = () => {
    if (!this.activeTarget) return;
    this.zoomFactor = Math.max(MIN_ZOOM, +(this.zoomFactor / ZOOM_MULT).toFixed(2));
    this.applyWrapperTransform(this.activeTarget.key);
  };

  resetView = () => {
    if (!this.activeTarget) return;
    this.moveX = 0;
    this.moveY = 0;
    this.applyPresetView(this.activeTarget.defaultView);
  };

  /**
   * D-pad menggeser TITIK FOKUS, bukan posisi model - jadi hasil kalibrasinya
   * bisa langsung ditempel ke ar.json sebagai `focus`. Arah panah mengikuti
   * LAYAR: rotasi cuma di sumbu Y, jadi layar-atas selalu sumbu Y model,
   * sedangkan layar-kanan harus diputar balik ke ruang model.
   */
  private panFocus(screenX: number, screenY: number) {
    if (!this.activeTarget) return;
    const rad = (this.rotY * Math.PI) / 180;
    this.focus.x += screenX * Math.cos(rad);
    this.focus.z += screenX * Math.sin(rad);
    this.focus.y += screenY;
    this.applyWrapperTransform(this.activeTarget.key);
  }

  moveLeft = () => this.panFocus(-MOVE_STEP, 0);
  moveRight = () => this.panFocus(MOVE_STEP, 0);
  moveUp = () => this.panFocus(0, MOVE_STEP);
  moveDown = () => this.panFocus(0, -MOVE_STEP);

  private applyPresetView(view?: ArHotspotView) {
    if (!view || !this.activeTarget) return;
    // `focus` boleh ditulis [x,y,z] atau {x,y,z}; keduanya diterima.
    if (view.focus) {
      const f = view.focus;
      this.focus = Array.isArray(f)
        ? { x: f[0] ?? 0, y: f[1] ?? 0, z: f[2] ?? 0 }
        : { x: f.x ?? 0, y: f.y ?? 0, z: f.z ?? 0 };
    }
    if (typeof view.zoom === "number") this.zoomFactor = Math.min(this.maxZoom, Math.max(MIN_ZOOM, view.zoom));
    if (typeof view.rotY === "number") this.rotY = view.rotY;
    if (typeof view.rotX === "number") this.rotX = view.rotX;
    if (typeof view.moveX === "number") this.moveX = view.moveX;
    if (typeof view.moveY === "number") this.moveY = view.moveY;
    this.applyWrapperTransform(this.activeTarget.key);
  }

  copyCurrentView = () => {
    if (!this.activeTarget) return;
    const isHotspot = document.querySelector(".ar-hotspot-pill.is-active") !== null;
    // Ikut menyalin `focus` supaya hasil kalibrasi D-pad (geser viewport) bisa
    // langsung ditempel ke ar.json, bukan cuma zoom & rotasi.
    const f = `[${this.focus.x.toFixed(3)}, ${this.focus.y.toFixed(3)}, ${this.focus.z.toFixed(3)}]`;
    const key = isHotspot ? "view" : "defaultView";
    const snippet = `"${key}": {\n    "rotY": ${Math.round(this.rotY)},\n    "zoom": ${this.zoomFactor.toFixed(2)},\n    "focus": ${f}\n  }`;

    navigator.clipboard?.writeText(snippet).catch(() => {});

    const toast = this.q("arCopyToast");
    if (toast) {
      toast.textContent = `Disalin:\n${snippet}`;
      toast.hidden = false;
      setTimeout(() => {
        toast.hidden = true;
      }, 4000);
    }
  };

  private initDragRotate() {
    const root = this.q("arSceneRoot");
    root?.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  private updateModel(targetKey: string, modelSrc: string | undefined, resetZoomRotation: boolean) {
    if (!modelSrc) return;
    const sceneRoot = this.q("arSceneRoot");
    const modelEl = sceneRoot?.querySelector(`[data-target-key="${targetKey}"] a-gltf-model`);
    if (!modelEl) return;

    const currentSrc = modelEl.getAttribute("src");
    if (currentSrc !== modelSrc) modelEl.setAttribute("src", modelSrc);

    if (resetZoomRotation) this.resetTransform(targetKey);
    else this.applyWrapperTransform(targetKey);
  }

  private setDescText(text: string) {
    const descs = this.qAll("[data-panel-desc]");
    if (!descs.length) return;
    descs.forEach((desc) => {
      desc.textContent = text;
      desc.classList.remove("is-expanded");
    });

    // Toggle "baca selengkapnya" cuma konsep mobile (bottom-sheet sempit) -
    // sidebar desktop discroll natural jadi gak render tombol ini sama
    // sekali. Pasangkan tiap toggle ke desc di dalam wrapper [data-panel-body]
    // yang sama, jangan asumsikan cuma ada satu di seluruh dokumen.
    const toggles = this.qAll<HTMLButtonElement>("[data-desc-toggle]");
    toggles.forEach((toggle) => (toggle.textContent = "Baca selengkapnya \u25be"));

    requestAnimationFrame(() => {
      toggles.forEach((toggle) => {
        const desc = toggle.closest("[data-panel-body]")?.querySelector<HTMLElement>("[data-panel-desc]");
        const isTruncated = !!desc && desc.scrollHeight > desc.clientHeight + 2;
        toggle.hidden = !isTruncated;
      });
    });
  }

  private openPanel(target: ArTarget, isFirstOpen: boolean) {
    const panel = this.q("arPanel");
    const titleEls = this.qAll("[data-panel-title]");
    const hotspotRows = this.qAll("[data-hotspot-row]");
    const dots = this.q("arProgressDots");
    const reopenBtn = this.q<HTMLButtonElement>("arReopenBtn");
    if (!titleEls.length || !hotspotRows.length) return;

    if (panel) panel.hidden = false;
    if (reopenBtn) reopenBtn.hidden = true;
    titleEls.forEach((el) => (el.textContent = target.label));

    hotspotRows.forEach((hotspotRow) => {
      hotspotRow.innerHTML = "";
      target.hotspots.forEach((h, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ar-hotspot-pill";
        if (this.visited.has(`${target.key}:${h.id}`)) btn.classList.add("is-visited-pill");
        btn.innerHTML = `<span class="ar-hotspot-pill-index">${String(idx + 1).padStart(2, "0")}</span><span class="ar-hotspot-pill-label">${h.label}</span>`;
        btn.dataset.hotspotId = h.id;
        btn.addEventListener("click", () => this.selectHotspot(target, h));
        hotspotRow.appendChild(btn);
      });
    });

    if (dots) {
      dots.innerHTML = target.hotspots
        .map(
          (h) =>
            `<span class="ar-dot${this.visited.has(`${target.key}:${h.id}`) ? " is-visited" : ""}" data-hotspot-id="${h.id}"></span>`,
        )
        .join("");
    }

    if (isFirstOpen) {
      this.updateModel(target.key, target.model, true);
      this.applyPresetView(target.defaultView);
      this.setDescText("Pilih salah satu bagian di atas untuk mendengar & membaca penjelasannya.");
      this.playIntroAudio(target.introAudio);
    } else {
      this.setDescText("Pilih salah satu bagian di atas untuk mendengar & membaca penjelasannya.");
    }
  }

  private selectHotspot(target: ArTarget, hotspot: ArTarget["hotspots"][number]) {
    if (this.audioBusy) return;

    const dots = this.q("arProgressDots");

    // Bukan cuma satu tombol yang diklik yang wajib ke-highlight - hotspot
    // yang sama muncul di DUA baris (mobile + desktop) sekaligus, jadi cari
    // lewat data-hotspot-id di SELURUH dokumen, bukan cuma di satu row.
    document.querySelectorAll(".ar-hotspot-pill").forEach((el) => el.classList.remove("is-active"));
    document.querySelectorAll(`.ar-hotspot-pill[data-hotspot-id="${hotspot.id}"]`).forEach((el) => {
      el.classList.add("is-active", "is-visited-pill");
    });

    this.updateModel(target.key, hotspot.model || target.model, false);
    this.applyPresetView(hotspot.view);
    this.setDescText(hotspot.teks);
    this.playNarrationAudio(hotspot.audio, null);

    const key = `${target.key}:${hotspot.id}`;
    this.visited.add(key);

    const dot = dots?.querySelector(`[data-hotspot-id="${hotspot.id}"]`);
    dot?.classList.add("is-visited");

    this.updateGateButton();
  }

  closePanel = () => {
    const panel = this.q("arPanel");
    const reopenBtn = this.q<HTMLButtonElement>("arReopenBtn");
    if (panel) panel.hidden = true;
    this.currentAudio?.pause();
    this.unlockHotspots();
    if (this.activeTarget && reopenBtn) reopenBtn.hidden = false;
  };

  reopenPanel = () => {
    if (this.activeTarget) this.openPanel(this.activeTarget, false);
  };

  toggleDesc = () => {
    const desc = this.q("arPanelDesc");
    const toggle = this.q<HTMLButtonElement>("arDescToggle");
    if (!desc || !toggle) return;
    const expanded = desc.classList.toggle("is-expanded");
    toggle.textContent = expanded ? "Sembunyikan \u25b4" : "Baca selengkapnya \u25be";
  };

  private buildScene() {
    const sceneRoot = this.q("arSceneRoot");
    if (!sceneRoot) return;

    const isViewer = this.mode === "viewer3d";

    const targetsHtml = this.config.targets
      .map((t) => {
        const animMode = t.model.includes("homo-sapiens.glb") ? "none" : "all";
        const wrapperHtml = `
        <a-entity class="ar-model-wrapper" data-wrapper="${t.key}" scale="1 1 1" rotation="0 0 0">
          <a-gltf-model src="${t.model}" position="0 0 0" autoplay-animations="mode: ${animMode}"></a-gltf-model>
        </a-entity>`;
        // Mode viewer3d: entity biasa, langsung tampil - tidak ada marker fisik
        // buat di-scan jadi tidak butuh mindar-image-target sama sekali.
        return isViewer
          ? `<a-entity data-target-key="${t.key}">${wrapperHtml}</a-entity>`
          : `
      <a-entity mindar-image-target="targetIndex: ${t.targetIndex}" data-target-key="${t.key}">${wrapperHtml}
      </a-entity>`;
      })
      .join("");

    // CATATAN "tombol Enter VR nongol di HP": komponennya BUKAN `vr-mode-ui`.
    // A-Frame 1.5.0 me-rename komponen itu jadi `xr-mode-ui` (cek
    // public/vendor/aframe-1.5.0.min.js - string "vr-mode-ui" sudah tidak ada di
    // bundle). Atribut yang tidak dikenal diabaikan diam-diam oleh A-Frame, jadi
    // `vr-mode-ui="enabled: false"` selama ini TIDAK melakukan apa-apa dan
    // tombol Enter VR/AR tetap disuntik ke DOM. HistoAR bukan aplikasi VR, dan
    // tombol itu kalau ke-tap siswa malah nge-hijack sesi WebXR + matiin kamera.
    // `styles.css` masih menyembunyikan .a-enter-vr/.a-enter-ar sebagai jaring
    // pengaman kalau nanti vendor di-upgrade dan namanya berubah lagi.
    // CATATAN "model tidak muncul" (invisible, bukan crash): `physicallyCorrectLights`
    // mengubah unit intensitas cahaya jadi lux/candela, tapi scene ini tidak
    // pernah mendefinisikan <a-light> sendiri - selalu mengandalkan default
    // light bawaan A-Frame (AmbientLight intensity 1, DirectionalLight 0.6),
    // yang dikalibrasi untuk model NON-physical. Di bawah physicallyCorrectLights,
    // 0.6 lux itu setara cahaya bulan sabit - GLB dengan MeshStandardMaterial jadi
    // hitam total di atas kanvas hitam: object3D.visible = true, matrix valid, tidak
    // ada error konsol, tapi TIDAK ADA piksel yang tampil (diverifikasi lewat
    // screenshot CDP: skor render sehat 100%, tapi model baru kelihatan setelah
    // cahaya disuntik manual dengan intensitas fisik yang wajar).
    // Mode viewer3d: tanpa mindar-image (tidak ada video/tracking), dan kamera
    // ditaruh mundur sedikit di sumbu Z supaya model (yang di-normalize ke
    // maks 1 satuan) kelihatan utuh - beda dari mode kamera, di mana kamera
    // duduk di titik anchor (0 0 0) dan MindAR yang ngatur jaraknya via marker.
    // `alpha: true` biar canvas transparan, nunjukin background CSS di
    // belakangnya alih-alih hitam solid bawaan renderer.
    const sceneAttrs = isViewer
      ? `color-space="sRGB" renderer="colorManagement: true; alpha: true" xr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false"`
      : `mindar-image="imageTargetSrc: ${this.config.targetMind}; autoStart: true; filterMinCF: 0.00001; filterBeta: 5; warmupTolerance: 5; missTolerance: 5;"
      color-space="sRGB" renderer="colorManagement: true"
      xr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false"`;
    const cameraHtml = isViewer
      ? `<a-camera position="0 0 2.2" look-controls="enabled: false"></a-camera>`
      : `<a-camera position="0 0 0" look-controls="enabled: false"></a-camera>`;

    sceneRoot.innerHTML = `
    <a-scene ${sceneAttrs}>
      ${cameraHtml}
      ${targetsHtml}
    </a-scene>
  `;

    this.config.targets.forEach((t) => {
      const el = sceneRoot.querySelector(`[data-target-key="${t.key}"]`);
      if (!el) return;

      // Library-nya diam total kalau GLTFLoader gagal (network/parse/GPU) - tanpa
      // listener ini, model yang gagal muat kelihatan sama persis kayak "nggak muncul".
      const modelEl = el.querySelector("a-gltf-model");
      modelEl?.addEventListener("model-error", (e: any) => {
        const src = modelEl.getAttribute("src") || t.model;
        console.error(`[ArEngine] Gagal load model "${t.key}":`, src, e?.detail ?? e);
        this.callbacks.onModelError?.(t.key, src, e?.detail ?? e);
      });

      // Pusatkan geometri model ke titik pivot wrapper tiap kali model dimuat
      // (termasuk saat ganti hotspot). Tanpa ini, model yang origin-nya meleset
      // dari pusat geometri akan "pindah" (naik/turun) saat di-zoom karena scale
      // terjadi terhadap origin, bukan pusat model. Dengan center-kan di runtime,
      // zoom & rotasi terjadi DI TEMPAT untuk semua materi, dan tetap benar walau
      // GLB versi lama (origin meleset) masih ke-cache.
      modelEl?.addEventListener("model-loaded", () => this.normalizeModel(modelEl as any, t.key));

      // Viewer3D tidak punya anchor MindAR sama sekali - tidak ada yang perlu
      // di-watch/found/lost, activateTarget() (dipanggil manual dari start()
      // atau selectTarget()) yang ngurus tampil/sembunyinya.
      if (isViewer) return;

      // Sembunyikan/munculkan model pakai event MindAR yang sudah di-debounce
      // (missTolerance), jadi model hilang saat marker benar-benar keluar frame
      // tanpa kelap-kelip karena jitter sesaat.
      const anchor = el as any;
      anchor.addEventListener("targetFound", () => this.handleTargetFound(anchor));
      anchor.addEventListener("targetLost", () => this.handleTargetLost(anchor, t));

      this.watchTarget(el, t);
    });
  }

  /**
   * Dua hal sekaligus, dari SATU kali pengukuran bounding box:
   *  1. geser model supaya pusatnya tepat di origin wrapper -> zoom & rotate
   *     terjadi DI TEMPAT, dan model duduk pas di tengah marker;
   *  2. normalkan ukurannya ke lebar marker -> `zoom` di ar.json punya makna
   *     fisik yang sama untuk semua model.
   */
  private normalizeModel(modelEl: any, targetKey?: string) {
    const THREE = (globalThis as any).AFRAME?.THREE ?? (globalThis as any).THREE;
    const obj = modelEl?.object3D;
    if (!THREE || !obj) return;
    obj.position.set(0, 0, 0);

    // PENTING (bug "model tidak muncul"): ukur bounding box di ruang LOKAL,
    // JANGAN pakai Box3.setFromObject() + worldToLocal() yang berbasis
    // world-matrix.
    //
    // Anchor `mindar-image-target` di-init dengan matrixAutoUpdate = false dan
    // matrix = "invisibleMatrix" (matriks NOL) selama target belum pernah
    // ke-scan. GLB hampir selalu selesai dimuat SEBELUM siswa mengarahkan
    // kamera, jadi saat `model-loaded` jalan, matrixWorld model = nol.
    // Konsekuensinya di three.js: Matrix4.invert() dari matriks nol
    // mengembalikan matriks nol -> Vector3.applyMatrix4 membagi dengan w = 0 ->
    // hasilnya NaN -> obj.position jadi NaN -> model TIDAK PERNAH ter-render,
    // bahkan setelah marker akhirnya ketemu (posisi NaN tidak pernah dihitung
    // ulang). Menghitung sendiri dari matrix lokal bikin proses centering
    // sepenuhnya lepas dari state tracking MindAR.
    const box = new THREE.Box3();
    const walk = (node: any, parentMatrix: any) => {
      if (node.matrixAutoUpdate) node.updateMatrix();
      const matrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, node.matrix);
      // WAJIB `geometry.boundingBox`, JANGAN `node.boundingBox`.
      //
      // SkinnedMesh punya computeBoundingBox() sendiri yang katanya "sadar
      // skinning", tapi hasilnya berada di ruang SKELETON (getVertexPosition
      // memakai bindMatrix + matriks bone), bukan di ruang lokal node. Mengalikan
      // hasil itu dengan rantai matriks node = mencampur dua ruang berbeda.
      // Terukur pada meganthropus.glb: node.boundingBox -> 0.18x0.20x0.22,
      // padahal ukuran sebenarnya 0.26x0.94x1.00 (dikonfirmasi dengan membaca
      // accessor POSITION langsung dari file GLB). Meleset 4.63x = skala root
      // rig-nya, dan itu bikin model jadi 4.6x terlalu besar: yang tampil cuma
      // telapak kaki.
      //
      // `geometry.boundingBox` = pose bind di ruang lokal mesh, yang memang
      // sejajar dengan node.matrix, jadi inilah yang benar untuk dirantai.
      const geometry = node.geometry;
      if (geometry) {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (geometry.boundingBox) box.union(geometry.boundingBox.clone().applyMatrix4(matrix));
      }
      node.children.forEach((child: any) => walk(child, matrix));
    };
    const identity = new THREE.Matrix4();
    obj.children.forEach((child: any) => walk(child, identity));

    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    // center ada di ruang lokal obj; obj.position ada di ruang parent.
    obj.updateMatrix();
    center.applyMatrix4(obj.matrix);
    // Sabuk pengaman: geometri rusak/NaN lebih baik dibiarkan tidak ter-center
    // daripada bikin seluruh model hilang.
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) return;
    obj.position.sub(center);

    // NORMALISASI UKURAN. Sisi terpanjang model dipetakan ke 1 satuan wrapper.
    // Karena postMatrix MindAR men-skala anchor sebesar lebar marker, 1 satuan
    // wrapper == lebar marker -> zoomFactor jadi "kelipatan lebar marker" yang
    // sama artinya untuk SEMUA model, sekecil apa pun GLB-nya diekspor.
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (Number.isFinite(maxDim) && maxDim > 1e-6) {
      this.modelUnitScale = 1 / maxDim;
      // Model dimuat ASINKRON, jadi applyPresetView() untuk hotspot ini biasanya
      // sudah jalan duluan dengan modelUnitScale model SEBELUMNYA. Wajib
      // di-apply ulang, kalau tidak ukurannya baru benar setelah user menyentuh
      // tombol zoom.
      if (targetKey) this.applyWrapperTransform(targetKey);
    }
  }

  /** Marker kembali terdeteksi: tampilkan model lagi. */
  private handleTargetFound(anchorEl: any) {
    if (anchorEl?.object3D) anchorEl.object3D.visible = true;
    const hint = this.q("arScanHint");
    if (hint) hint.hidden = true;
  }

  /** Marker keluar frame (setelah debounce MindAR): sembunyikan model + kembalikan hint. */
  private handleTargetLost(anchorEl: any, t: ArTarget) {
    if (anchorEl?.object3D) anchorEl.object3D.visible = false;
    if (this.trackingKey === t.key) this.trackingKey = null;
    document.body.classList.remove("ar-locked-in");
    const hint = this.q("arScanHint");
    if (hint) hint.hidden = false;
    const viewControls = this.q("arViewControls");
    if (viewControls) viewControls.hidden = true;
    const moveControls = this.q("arMoveControls");
    if (moveControls) moveControls.hidden = true;
  }

  /**
   * Kita cuma "nyempil" di updateWorldMatrix buat nge-hook transisi found
   * (onTargetTracked: buka panel, set activeTarget, tampilin kontrol) — BUKAN
   * buat ngubah perilaku visibilitas MindAR.
   *
   * PENTING (bug "model nyangkut di layar"): setiap update HARUS tetap diteruskan
   * ke MindAR, termasuk update null. MindAR sendiri yang nge-emit event
   * `targetLost`/`targetFound` (dan nge-set object3D.visible) di dalam
   * updateWorldMatrix. Versi lama nyegat null di sini ("pertahankan pose
   * terakhir") — akibatnya MindAR nggak pernah nge-emit targetLost, jadi
   * handleTargetLost mati total dan model tetap kelihatan walau marker udah
   * keluar frame. Sekarang null tetap diteruskan: MindAR nge-emit targetLost
   * (udah di-debounce lewat missTolerance, jadi jitter sesaat nggak bikin
   * kelap-kelip) -> handleTargetLost sembunyiin model + balikin hint scan.
   *
   * Yang TETAP kita hindari: nge-hack `object3D.visible = true` di targetLost
   * (bug lama) — itu yang dulu bikin transform kolaps ke satu titik + targetFound
   * mati permanen. Di sini kita nggak nyentuh .visible sama sekali di jalur ini.
   */
  private watchTarget(el: Element, t: ArTarget) {
    const anchorEl = el as any;

    const patch = () => {
      const comp = anchorEl.components?.["mindar-image-target"];
      if (!comp) return false;
      if (comp.__histoarPatched) return true;
      comp.__histoarPatched = true;

      const forward = comp.updateWorldMatrix.bind(comp);
      comp.updateWorldMatrix = (worldMatrix: number[] | null) => {
        if (this.disposed) return;
        // Selalu teruskan (termasuk null) supaya MindAR nge-emit targetFound/
        // targetLost seperti biasa. Transisi found kita hook di bawah.
        forward(worldMatrix);
        if (!worldMatrix) return;
        this.activateTarget(t);
      };
      return true;
    };

    // Komponen MindAR baru ke-init setelah <a-scene> selesai attach, jadi kalau
    // belum ada kita tunggu event init-nya.
    if (!patch()) {
      anchorEl.addEventListener("componentinitialized", (e: any) => {
        if (e.detail?.name === "mindar-image-target") patch();
      });
    }
  }

  /**
   * Dipanggil tiap kali sebuah target jadi "aktif": mode kamera lewat transisi
   * targetFound (dari watchTarget di atas), mode viewer3d dipanggil manual
   * dari start() (auto-pilih target pertama) dan selectTarget() (klik chip
   * pemilih target). Isinya sama persis di kedua mode - buka panel, tampilkan
   * kontrol, sembunyikan target lain (biar model gak numpuk buat materi
   * multi-target).
   */
  private activateTarget(t: ArTarget) {
    if (this.trackingKey === t.key) return;

    if (this.trackingKey) {
      const prev = this.q("arSceneRoot")?.querySelector(`[data-target-key="${this.trackingKey}"]`) as any;
      if (prev?.object3D) prev.object3D.visible = false;
    }

    this.trackingKey = t.key;
    this.activeTarget = t;
    const el = this.q("arSceneRoot")?.querySelector(`[data-target-key="${t.key}"]`) as any;
    if (el?.object3D) el.object3D.visible = true;

    document.body.classList.add("ar-locked-in");
    const hint = this.q("arScanHint");
    if (hint) hint.hidden = true;
    const viewControls = this.q("arViewControls");
    if (viewControls) viewControls.hidden = false;
    const moveControls = this.q("arMoveControls");
    if (moveControls) moveControls.hidden = false;

    const isFirstTime = !this.openedTargets.has(t.key);
    this.openedTargets.add(t.key);
    if (isFirstTime) this.openPanel(t, true);
  }

  /** Viewer3D saja: ganti target aktif lewat chip pemilih, bukan hasil scan. */
  selectTarget = (key: string) => {
    if (this.mode !== "viewer3d") return;
    const t = this.config.targets.find((x) => x.key === key);
    if (t) this.activateTarget(t);
  };

  start() {
    ensureAutoplayComponent();
    if (this.mode === "camera") ensureCameraFitPatch();
    this.buildScene();
    this.updateGateButton();
    this.initDragRotate();
    if (this.mode === "viewer3d") {
      const first = this.config.targets[0];
      if (first) this.activateTarget(first);
    }
  }

  /** Bersihin listener, audio, dan A-Frame scene pas komponen React unmount. */
dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.currentAudio?.pause();
    if (this.audioTimeoutHandle) clearTimeout(this.audioTimeoutHandle);
    document.body.classList.remove("ar-locked-in");

    // A-Frame nempelin class "a-fullscreen" ke <html> pas <a-scene> connect
    // (html jadi position:fixed + body overflow:hidden) dan cuma ngelepasnya
    // kalau scene-nya punya atribut "embedded" - disconnectedCallback-nya nggak
    // bersih-bersih. Tanpa baris ini, halaman lain nggak bisa discroll setelah
    // user balik dari mode AR.
    document.documentElement.classList.remove("a-fullscreen");

    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);

    const sceneRoot = this.q("arSceneRoot");
    const sceneEl = sceneRoot?.querySelector("a-scene") as any;

    // Matiin sistem MindAR dulu (megang webcam loop) sebelum DOM dihapus,
    // kalau cuma innerHTML = "" doang, stream kamera bisa tetap nyala di background.
    const arSystem = sceneEl?.systems?.["mindar-image-system"];
    try {
      arSystem?.stop?.();
    } catch {
      // stop() nyentuh this.video yang bisa aja belum ada kalau user keluar pas
      // kamera masih nyala-in. Kalau throw di situ, controller.dispose() di baris
      // terakhirnya nggak kejalan -> worker MindAR bocor tiap masuk-keluar AR.
      try {
        arSystem?.controller?.dispose?.();
      } catch {
        // controller belum ke-init, aman diabaikan
      }
    }

    // Jaga-jaga: matiin manual semua video track yang aktif di halaman ini.
    document.querySelectorAll("video").forEach((video) => {
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      video.remove();
    });

    document
  .querySelectorAll(
    ".mindar-ui-overlay, .mindar-ui-scanning, .mindar-ui-loading, .mindar-ui-compatibility",
  )
  .forEach((el) => el.remove());

    if (sceneRoot) sceneRoot.innerHTML = "";
}
}
