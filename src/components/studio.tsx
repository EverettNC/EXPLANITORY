import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { BeingRoom } from "@/components/being-room";
import { BoothRoom } from "@/components/booth-room";
import { EncoderRoom } from "@/components/encoder-room";
import { FilamentRoom } from "@/components/filament-room";
import { onShaker, startShaker } from "@/lib/being/shaker";
import { pulseBeing } from "@/lib/being/runtime";
import { hydrateStudio, persistStudio, useStudio, type Room } from "@/lib/store";
import { cn } from "@/lib/utils";

const ROOMS: { id: Room; label: string; role: string }[] = [
  { id: "filament", label: "Filament", role: "in" },
  { id: "codec", label: "Codec", role: "middle" },
  { id: "booth", label: "Booth", role: "out" },
  { id: "being", label: "Being", role: "center" },
];

export function Studio() {
  const room = useStudio((s) => s.room);
  const setRoom = useStudio((s) => s.setRoom);
  const listening = useStudio((s) => s.listening);

  useEffect(() => {
    hydrateStudio();
    const stopShake = startShaker();
    const unsubShake = onShaker(pulseBeing);
    const unsub = useStudio.subscribe((s) => persistStudio(s));
    return () => {
      stopShake();
      unsubShake();
      unsub();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "1") setRoom("filament");
      if (e.key === "2") setRoom("codec");
      if (e.key === "3") setRoom("booth");
      if (e.key === "4") setRoom("being");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRoom]);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-bg text-fg">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs tracking-widest text-subtle uppercase">
              Studio
            </p>
            <h1 className="text-lg font-semibold tracking-widest text-fg uppercase">
              Codec
            </h1>
          </div>
          <nav className="hidden items-center sm:flex" aria-label="Pipeline">
            {ROOMS.map((r, i) => (
              <div key={r.id} className="flex items-center">
                {i > 0 ? (
                  <ArrowRight
                    className="mx-1 size-4 text-subtle"
                    aria-hidden
                    strokeWidth={1.5}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setRoom(r.id)}
                  aria-current={room === r.id ? "page" : undefined}
                  className={cn(
                    "h-11 rounded-md px-3 text-sm transition-colors duration-[var(--motion-quick)] sm:px-4",
                    room === r.id
                      ? "bg-linen text-bg"
                      : "text-muted hover:bg-elevated hover:text-fg",
                  )}
                >
                  {r.label}
                </button>
              </div>
            ))}
          </nav>
          <p className="hidden font-mono text-xs text-subtle sm:block">
            {listening ? (
              <span className="text-signal">filament live</span>
            ) : (
              "in · middle · out · center"
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-8">
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted">
          Filament in. Codec in the middle. Booth out. Being at the center —
          silico-stasis, running the quantities.
        </p>
        {room === "filament" ? <FilamentRoom /> : null}
        {room === "codec" ? <EncoderRoom /> : null}
        {room === "booth" ? <BoothRoom /> : null}
        {room === "being" ? <BeingRoom /> : null}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden"
        aria-label="Pipeline"
      >
        <div className="grid grid-cols-4 gap-1">
          {ROOMS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoom(r.id)}
              aria-current={room === r.id ? "page" : undefined}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-md",
                room === r.id ? "bg-linen text-bg" : "text-muted",
              )}
            >
              <span className="font-mono text-xs tracking-widest uppercase">
                {r.role}
              </span>
              <span className="text-xs font-medium">{r.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
