import type { ReactNode } from "react";

export function DetailContent({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 content-start overflow-auto bg-panel">
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
    <section className="min-w-0 border-b border-line-subtle bg-panel p-5 last:border-b-0">
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
