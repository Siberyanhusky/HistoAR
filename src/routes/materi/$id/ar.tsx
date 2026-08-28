import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import materiData from "@/data/materi.json";
import arData from "@/data/ar.json";
import type { ArData, MateriData } from "@/lib/histoar-types";
import { isMateriUnlocked } from "@/lib/progress";
import { ArScan } from "@/components/histoar/ArScan";

const { materi: materiList } = materiData as MateriData;
const arConfigAll = arData as unknown as ArData;

export const Route = createFileRoute("/materi/$id/ar")({
  loader: ({ params }) => {
    const materi = materiList.find((m) => m.id === params.id);
    if (!materi) throw notFound();
    return { materi, arConfig: arConfigAll[params.id] };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `Scan AR · ${loaderData?.materi.judul ?? ""} · HistoAR` }],
  }),
  component: MateriArPage,
});

function MateriArPage() {
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

  return <ArScan materiId={materi.id} materiJudul={materi.judul} arConfig={arConfig} onAllExplored={() => {}} />;
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
