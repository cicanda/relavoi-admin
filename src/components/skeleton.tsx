export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md animate-shimmer ${className}`} />;
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  );
}
