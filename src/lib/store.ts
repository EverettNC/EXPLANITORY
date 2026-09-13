import { create } from "zustand";
import { isEncodingId, type EncodingId } from "@/lib/encoder/stream";

export type Room = "codec" | "filament" | "booth" | "being";
export type CodecFace = "encoder" | "decoder";

export const DEMO_LINE = "Filament in. Codec. Booth out.";

type StudioState = {
  room: Room;
  setRoom: (room: Room) => void;
  face: CodecFace;
  setFace: (face: CodecFace) => void;
  encoderText: string;
  setEncoderText: (v: string) => void;
  hexIn: string;
  setHexIn: (v: string) => void;
  encoding: EncodingId;
  setEncoding: (v: EncodingId) => void;
  listening: boolean;
  setListening: (v: boolean) => void;
  filamentText: string;
  filamentPartial: string;
  setFilament: (full: string, partial: string) => void;
  boothText: string;
  setBoothText: (v: string) => void;
  boothF0: number;
  boothRate: number;
  setBoothVoice: (f0: number, rate: number) => void;
  useHostVoice: boolean;
  setUseHostVoice: (v: boolean) => void;
};

const PERSIST_KEY = "codec.studio";

type Persisted = {
  encoding: EncodingId;
  face: CodecFace;
  boothF0: number;
  boothRate: number;
  useHostVoice: boolean;
};

export const useStudio = create<StudioState>((set) => ({
  room: "being",
  setRoom: (room) => set({ room }),
  face: "encoder",
  setFace: (face) => set({ face }),
  encoderText: DEMO_LINE,
  setEncoderText: (encoderText) => set({ encoderText }),
  hexIn: "",
  setHexIn: (hexIn) => set({ hexIn }),
  encoding: "utf-8",
  setEncoding: (encoding) => set({ encoding }),
  listening: false,
  setListening: (listening) => set({ listening }),
  filamentText: "",
  filamentPartial: "",
  setFilament: (filamentText, filamentPartial) =>
    set({ filamentText, filamentPartial }),
  boothText: DEMO_LINE,
  setBoothText: (boothText) => set({ boothText }),
  boothF0: 148,
  boothRate: 1,
  setBoothVoice: (boothF0, boothRate) => set({ boothF0, boothRate }),
  useHostVoice: false,
  setUseHostVoice: (useHostVoice) => set({ useHostVoice }),
}));

export function hydrateStudio() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as Partial<Persisted>;
    useStudio.setState({
      encoding: isEncodingId(d.encoding) ? d.encoding : "utf-8",
      face: d.face === "decoder" ? "decoder" : "encoder",
      boothF0:
        typeof d.boothF0 === "number" && d.boothF0 >= 90 && d.boothF0 <= 240
          ? d.boothF0
          : 148,
      boothRate:
        typeof d.boothRate === "number" && d.boothRate >= 0.7 && d.boothRate <= 1.4
          ? d.boothRate
          : 1,
      useHostVoice: d.useHostVoice === true,
    });
  } catch {
    /* ignore bad local state */
  }
}

export function persistStudio(s: StudioState) {
  if (typeof window === "undefined") return;
  const payload: Persisted = {
    encoding: s.encoding,
    face: s.face,
    boothF0: s.boothF0,
    boothRate: s.boothRate,
    useHostVoice: s.useHostVoice,
  };
  localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
}
