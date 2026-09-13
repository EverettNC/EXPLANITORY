import { cn } from "@/lib/utils";

export function ByteTape({
  bytes,
  active,
}: {
  bytes: Uint8Array;
  active?: number;
}) {
  const shown = bytes.length > 256 ? bytes.subarray(0, 256) : bytes;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.length === 0 ? (
        <span className="font-mono text-xs text-subtle">no bytes</span>
      ) : (
        Array.from(shown, (b, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-1 font-mono text-xs tabular-nums",
              i === active
                ? "bg-linen text-bg"
                : b === 0x3f
                  ? "bg-elevated text-warn"
                  : b < 0x20 || b > 0x7e
                    ? "bg-elevated text-signal"
                    : "bg-elevated text-fg",
            )}
            title={`offset ${i} · ${b}`}
          >
            {b.toString(16).padStart(2, "0")}
          </span>
        ))
      )}
      {bytes.length > shown.length ? (
        <span className="inline-flex h-8 items-center px-2 font-mono text-xs text-subtle">
          +{bytes.length - shown.length}
        </span>
      ) : null}
    </div>
  );
}

export function HexRows({
  bytes,
}: {
  bytes: Uint8Array;
}) {
  const width = 16;
  const rows = Math.ceil(Math.min(bytes.length, 512) / width) || 1;
  return (
    <div className="max-w-full overflow-x-auto font-mono text-xs leading-6 text-muted">
      {Array.from({ length: rows }, (_, r) => {
        const off = r * width;
        const slice = bytes.subarray(off, off + width);
        if (slice.length === 0 && r > 0) return null;
        const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0"));
        while (hex.length < width) hex.push("  ");
        const ascii = Array.from(slice, (b) =>
          b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·",
        ).join("");
        return (
          <div key={r} className="flex gap-4 whitespace-nowrap">
            <span className="w-10 text-subtle tabular-nums">
              {off.toString(16).padStart(4, "0")}
            </span>
            <span className="text-fg">{hex.join(" ")}</span>
            <span className="text-signal">{ascii}</span>
          </div>
        );
      })}
    </div>
  );
}
