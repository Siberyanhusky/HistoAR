import { Send, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";

import { askHistoAI } from "../../lib/histo-ai";

type Message = { role: "ai" | "user"; text: string };

const seed: Message[] = [
  { role: "ai", text: "Selamat datang. Aku HistoAI, pemandu kamu. Tanyakan apa saja soal materi kehidupan praaksara kelas 10." },
];

const prompts = [
 "Jelaskan periodisasi bumi untuk siswa kelas 10",
 "Bandingkan zaman berburu-meramu dengan zaman bercocok tanam",
 "Tunjukkan perbedaan Meganthropus, Pithecanthropus, dan Homo",
];

export function AIGuide() {
  const [messages, setMessages] = useState<Message[]>(seed);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;

    setInput("");
    const priorHistory = messages.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }));
    setMessages((m) => [...m, { role: "user", text: t }]);
    setLoading(true);

    try {
      const { text: reply } = await askHistoAI({
        data: { message: t, history: priorHistory },
      });
      setMessages((m) => [...m, { role: "ai", text: reply }]);
    } catch (err) {
      console.error(err);
      // DEBUG SEMENTARA: nampilin detail error asli di chat biar kelihatan
      // tanpa perlu buka Vercel dashboard. Hapus lagi kalau udah ketemu akar
      // masalahnya.
      const detail = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        { role: "ai", text: `Maaf, ada gangguan saat menjawab. [DEBUG] ${detail}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="ai" className="relative mx-auto max-w-6xl px-6 py-32">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="catalog-label mb-4 flex items-center gap-2 text-accent-foreground">
            <Sparkles className="h-3 w-3" /> Pemandu AI
          </div>
          <h2 className="font-display text-4xl font-medium sm:text-5xl">
            Kenalan dengan <span className="text-primary">HistoAI</span>.
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-muted-foreground">
            HistoAI menjawab pertanyaan seputar setiap materi, dengan gaya
            penyampaian yang menyesuaikan rasa ingin tahu dan kecepatan
            belajarmu. Ia tidak pernah bosan menjawab "kenapa?"
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={loading}
                className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex h-[520px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_80px_-30px_oklch(0_0_0/0.25)]">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-primary/40">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-success" />
            </div>
            <div>
              <div className="text-sm font-medium">HistoAI</div>
              <div className="catalog-label">Pemandu AI · Online</div>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background/40 text-foreground"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/40 px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Berpikir…
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya HistoAI…"
              disabled={loading}
              className="flex-1 rounded-full border border-border bg-background/40 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Kirim"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
