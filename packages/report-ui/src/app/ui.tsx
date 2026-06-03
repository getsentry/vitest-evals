import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "empty" | "trace";

const toneText: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-pass",
  warn: "text-warn",
  bad: "text-fail",
  empty: "text-muted",
  trace: "text-trace",
};

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function toneTextClass(tone: Tone) {
  return toneText[tone];
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "min-w-0 overflow-hidden rounded-lg border border-line bg-panel",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-4 border-b border-line-subtle px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {detail ? (
          <p className="mt-1 truncate text-xs text-muted">{detail}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="min-h-16 bg-panel px-3 py-2.5">
      <span className="block text-[0.68rem] font-semibold uppercase text-muted">
        {label}
      </span>
      <strong
        className={cx("mt-1 block text-xl font-semibold", toneTextClass(tone))}
      >
        {value}
      </strong>
    </div>
  );
}

export function Field({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label
        className="text-xs font-semibold text-muted-strong"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink outline-none",
        "placeholder:text-muted focus:border-selected-line focus:ring-2 focus:ring-selected",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink outline-none",
        "focus:border-selected-line focus:ring-2 focus:ring-selected",
        props.className,
      )}
    />
  );
}

export function TabButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "h-8 border-b-2 px-2.5 text-sm capitalize outline-none transition",
        selected
          ? "border-ink text-ink"
          : "border-transparent text-muted-strong hover:border-line hover:text-ink",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-panel-subtle p-3 font-mono text-xs leading-relaxed text-code">
      {value}
    </pre>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="p-4 text-sm text-muted">{children}</p>;
}
