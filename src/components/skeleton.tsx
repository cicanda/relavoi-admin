export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded animate-shimmer ${className}`} />;
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3 border-t border-ink-700">
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  );
}
