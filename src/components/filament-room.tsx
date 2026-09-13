import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Upload } from "lucide-react";
import { Panel, Stat } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Waveform } from "@/components/waveform";
import { FRAME_SEC } from "@/lib/audio/dsp";
import { engine } from "@/lib/audio/engine";
import { forceAlign } from "@/lib/audio/recognize";
import { DEMO_LINE, useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type ResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

function getRecog(): Recog | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function FilamentRoom() {
  const listening = useStudio((s) => s.listening);
  const setListening = useStudio((s) => s.setListening);
  const text = useStudio((s) => s.filamentText);
  const partial = useStudio((s) => s.filamentPartial);
  const setFilament = useStudio((s) => s.setFilament);
  const setEncoderText = useStudio((s) => s.setEncoderText);
  const setRoom = useStudio((s) => s.setRoom);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const recogRef = useRef<Recog | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef(false);

  useEffect(() => {
    return engine.subscribe(() => setTick((n) => n + 1));
  }, []);

  useEffect(() => {
    return () => {
      recogRef.current?.abort();
      void engine.stopMic();
    };
  }, []);

  const snap = engine.snap;
  void tick;

  const captions = useMemo(() => {
    const path = snap.result?.ctcPath;
    if (hostRef.current && text.trim() && path && path.length) {
      return forceAlign(text, path, FRAME_SEC);
    }
    return snap.aligned;
  }, [text, snap.result, snap.aligned]);

  const start = async () => {
    setError(null);
    hostRef.current = false;
    await engine.startMic();
    if (engine.lastError) {
      setError(engine.lastError);
      setListening(false);
      return;
    }
    setListening(true);
    const rec = getRecog();
    if (!rec) {
      setError(null);
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      let final = "";
      let inter = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const row = ev.results[i]!;
        if (row.isFinal) final += row[0].transcript;
        else inter += row[0].transcript;
      }
      const prev = useStudio.getState().filamentText;
      const next = (prev + (final ? (prev ? " " : "") + final.trim() : "")).trim();
      hostRef.current = true;
      setFilament(next, inter.trim());
    };
    rec.onerror = (ev) => {
      if (ev.error !== "no-speech" && ev.error !== "aborted") {
        setError(ev.error);
      }
    };
    rec.onend = () => {
      if (useStudio.getState().listening) {
        try {
          rec.start();
        } catch {
          /* restart races */
        }
      }
    };
    try {
      rec.start();
      recogRef.current = rec;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recognizer failed.");
    }
  };

  const stop = async () => {
    setListening(false);
    recogRef.current?.stop();
    recogRef.current = null;
    await engine.stopMic();
  };

  useEffect(() => {
    if (snap.source === "mic" && listening && !hostRef.current && snap.transcript) {
      setFilament(snap.transcript, "");
    }
  }, [snap.transcript, snap.source, listening, setFilament]);

  const sendToCodec = () => {
    const line = text || snap.transcript;
    if (!line) return;
    setEncoderText(line);
    setRoom("codec");
  };

  const tPlay = snap.playhead * snap.duration;
  const display = text || snap.transcript;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-12">
      <Panel kicker="filament" title="Listen" className="lg:col-span-8">
        <div className="overflow-hidden rounded-md bg-elevated">
          <Waveform height={120} />
        </div>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {captions.length === 0 ? (
            <p className="px-1 text-sm text-muted">No captions yet.</p>
          ) : (
            captions.map((w, i) => {
              const on = tPlay >= w.start && tPlay < w.end;
              return (
                <span
                  key={`${w.word}-${i}`}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center rounded-sm px-3 text-sm",
                    on ? "bg-linen text-bg" : "bg-elevated text-muted",
                  )}
                  title={`${w.start.toFixed(2)}–${w.end.toFixed(2)}s`}
                >
                  {w.word}
                </span>
              );
            })
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {listening ? (
            <Button variant="signal" onClick={stop}>
              <MicOff />
              Stop
            </Button>
          ) : (
            <Button onClick={start}>
              <Mic />
              Listen
            </Button>
          )}
          <Button
            variant="quiet"
            onClick={() => {
              const line = DEMO_LINE;
              setFilament(line, "");
              void engine.runDemo(line);
            }}
          >
            Demo line
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload />
            Audio file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.m4a"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void engine.loadFile(f).then(() => {
                setFilament(engine.snap.transcript, "");
              });
              e.target.value = "";
            }}
          />
        </div>
        {error ? (
          <p className="mt-3 text-sm text-warn" role="status">
            {error}
          </p>
        ) : null}
      </Panel>

      <Panel kicker="meter" title="Ear" className="lg:col-span-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="source" value={snap.source} />
          <Stat label="voicing" value={snap.vad ? "live" : "idle"} hot={snap.vad} />
          <Stat label="F0" value={snap.vad && snap.f0 ? `${Math.round(snap.f0)} Hz` : "—"} />
          <Stat label="captions" value={String(captions.length)} />
        </div>
        <p className="mt-4 font-mono text-xs leading-relaxed text-signal">
          {snap.result?.phones.slice(0, 24).join(" ") || "∅"}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Unknown audio is decoded in this tab against the Klatt lexicon —
          the same mouth as Booth. Times come from the encoder. Host
          recognizer, if present, supplies the words; we align them.
        </p>
      </Panel>

      <Panel kicker="transcript" title="Taken down" className="lg:col-span-12">
        <p
          className="min-h-24 text-xl leading-snug tracking-tight text-fg"
          aria-live="polite"
        >
          {display || <span className="text-subtle">Waiting on Filament.</span>}
          {partial ? <span className="text-muted"> {partial}</span> : null}
        </p>
        <div className="mt-4">
          <Button onClick={sendToCodec} disabled={!display}>
            Send to codec
          </Button>
        </div>
      </Panel>
    </div>
  );
}
