export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-[var(--section-gap)] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[length:var(--text-display)] font-normal text-fg tracking-[-0.035em] leading-[1.1]">{title}</h1>
        {description && <p className="text-[15px] text-fg-2 mt-2 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
