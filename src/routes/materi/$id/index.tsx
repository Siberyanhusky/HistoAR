import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import materiData from "@/data/materi.json";
import arData from "@/data/ar.json";
import type { ArData, MateriData } from "@/lib/histoar-types";
import { isMateriUnlocked } from "@/lib/progress";
import { ScanLine, Box, ChevronLeft } from "lucide-react";

const { materi: materiList } = materiData as MateriData;
const arConfigAll = arData as unknown as ArData;

export const Route = createFileRoute("/materi/$id/")({
  loader: ({ params }) => {
    const materi = materiList.find((m) => m.id === params.id);
    if (!materi) throw notFound();
    return { materi, arConfig: arConfigAll[params.id] };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.materi.judul ?? ""} · HistoAR` }],
  }),
  component: MateriChoicePage,
});

// Halaman antara sebelum masuk ke model 3D materi ini - siswa pilih mau lewat
// AR (kamera + scan marker fisik di buku) atau lewat viewer 3D biasa (tanpa
// kamera sama sekali). Sengaja TIDAK auto-buka kamera begitu halaman ini
// dimuat: siswa yang sudah tahu kameranya bermasalah bisa langsung pilih mode
// 3D tanpa perlu memicu izin kamera dulu. Di dalam mode AR sendiri juga ada
// jalan pintas ke mode 3D ini kalau baru ketauan kameranya bermasalah di
// tengah jalan (lihat tombol "Kamera bermasalah?" di ArScan.tsx).
function MateriChoicePage() {
  const { materi, arConfig } = Route.useLoaderData();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    setUnlocked(isMateriUnlocked(materiList, materi.id));
  }, [materi.id]);

  if (unlocked === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Memuat…
      </div>
    );
  }

  if (!unlocked) {
    return <BlockedState message="Materi ini masih terkunci. Selesaikan materi sebelumnya dulu ya." />;
  }

  if (!arConfig) {
    return <BlockedState message="Belum ada konfigurasi AR untuk materi ini." />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-10">
      <Link to="/materi" className="mb-8 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Kembali ke daftar materi
      </Link>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8">
        <div>
          <span className="catalog-label">{materi.kode}</span>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-snug">{materi.judul}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{materi.ringkasan}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/materi/$id/ar"
            params={{ id: materi.id }}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ScanLine className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-base font-medium">Mulai AR</span>
              <span className="block text-xs text-muted-foreground">Scan marker fisik di buku pakai kamera</span>
            </span>
          </Link>

          <Link
            to="/materi/$id/viewer"
            params={{ id: materi.id }}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground">
              <Box className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-base font-medium">Jelajahi 3D</span>
              <span className="block text-xs text-muted-foreground">Tanpa kamera - buat HP yang kameranya bermasalah</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function BlockedState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="max-w-md text-muted-foreground">{message}</p>
      <Link to="/materi" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
        Kembali ke daftar materi
      </Link>
    </div>
  );
}
