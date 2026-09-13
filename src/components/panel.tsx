import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  kicker,
  action,
  className,
  children,
}: {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      {(title || action || kicker) && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            {kicker ? (
              <p className="font-mono text-xs tracking-widest text-subtle uppercase">
                {kicker}
              </p>
            ) : null}
            {title ? (
              <h2 className="text-sm font-medium tracking-tight text-fg">{title}</h2>
            ) : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs tracking-widest text-subtle uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-sm tabular-nums",
          hot ? "text-signal" : "text-fg",
        )}
      >
        {value}
      </p>
    </div>
  );
}
