// Tipe data untuk konten Histoar - materi, quiz, dan konfigurasi AR.
// Struktur mengikuti data/materi.json, data/quiz.json, data/ar.json.

export interface MateriKonten {
  judul: string;
  isi: string;
}

export interface Materi {
  id: string;
  urutan: number;
  kode: string;
  layerColor: string;
  judul: string;
  ringkasan: string;
  konten: MateriKonten[];
}

export interface MateriData {
  materi: Materi[];
}

export interface QuizQuestion {
  id: string;
  pertanyaan: string;
  opsi: string[];
  jawaban: number;
}

export interface QuizData {
  quiz: Record<string, QuizQuestion[]>;
}

/**
 * Tampilan kamera untuk satu target/hotspot.
 *
 * `zoom`  = KELIPATAN LEBAR MARKER (engine menormalkan tiap GLB saat dimuat),
 *           jadi 1.0 berarti sisi terpanjang model selebar marker; 0.85 = muat
 *           utuh dengan margin. Bukan lagi angka bebas seperti versi lama.
 * `focus` = titik yang ditaruh di tengah layar, sebagai FRAKSI ukuran model
 *           relatif pusatnya (-0.5..0.5 kira-kira menutupi seluruh model).
 *           Inilah yang bikin tiap hotspot terasa "pindah viewport": kamera
 *           bergeser ke satu bagian, bukan modelnya yang membesar.
 */
export interface ArHotspotView {
  rotY?: number;
  rotX?: number;
  zoom?: number;
  moveX?: number;
  moveY?: number;
  focus?: [number, number, number] | { x?: number; y?: number; z?: number };
}

export interface ArHotspot {
  id: string;
  label: string;
  model: string;
  audio?: string;
  teks: string;
  view?: ArHotspotView;
}

export interface ArTarget {
  key: string;
  label: string;
  targetIndex: number;
  model: string;
  defaultView?: ArHotspotView;
  introAudio?: string;
  hotspots: ArHotspot[];
  _locked?: boolean;
}

export interface ArMateriConfig {
  targetMind: string;
  maxZoom?: number;
  // Izinkan drag vertikal (atas-bawah layar) ikut memutar model di sumbu X,
  // bukan cuma horizontal/sumbu Y seperti default. Dipakai materi yang
  // beberapa modelnya perlu dilihat dari atas (mis. "Ekskavasi Digital" di
  // Ragam Temuan) - lihat ROTX_DRAG_RANGE di ar-engine.ts untuk batas sudutnya.
  allowTiltDrag?: boolean;
  targets: ArTarget[];
}

export type ArData = Record<string, ArMateriConfig>;

export interface ChatMessage {
  role: "user" | "bot";
  text: string;
}
