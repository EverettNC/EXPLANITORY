import { useEffect, useRef } from "react";
import { engine } from "@/lib/audio/engine";

export function Waveform({ height = 88 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const styles = getComputedStyle(document.documentElement);
      const bg = styles.getPropertyValue("--color-elevated").trim() || "#1d1d19";
      const fg = styles.getPropertyValue("--color-signal").trim() || "#9aaf98";
      const ink = styles.getPropertyValue("--color-subtle").trim() || "#5c5a54";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const pcm = engine.snap.pcm;
      const play = engine.snap.playhead;
      if (pcm.length > 1) {
        const step = Math.max(1, Math.floor(pcm.length / w));
        let peak = 1e-4;
        for (let x = 0; x < w; x++) {
          const i = Math.min(pcm.length - 1, x * step);
          peak = Math.max(peak, Math.abs(pcm[i]!));
        }
        const g = (h * 0.42) / peak;
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const i = Math.min(pcm.length - 1, x * step);
          const y = h / 2 - pcm[i]! * g;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (play > 0 && play < 1) {
          ctx.strokeStyle = styles.getPropertyValue("--color-linen").trim() || "#d8d3c6";
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(play * w, 0);
          ctx.lineTo(play * w, h);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className="block h-full w-full"
      style={{ height }}
      aria-hidden
    />
  );
}
