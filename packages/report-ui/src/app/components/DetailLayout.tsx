import type { ReactNode } from "react";

export function DetailContent({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 content-start gap-px overflow-auto bg-line-subtle">
      {children}
    </div>
  );
}

export function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 bg-panel p-4">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyDetail({ children }: { children: string }) {
  return <p className="min-h-[420px] p-6 text-sm text-muted">{children}</p>;
}
