export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="bg-signal-500 flex items-center justify-center rounded-md flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span
        className="font-mono font-bold text-ink-900 leading-none"
        style={{ fontSize: Math.round(size * 0.55) }}
      >
        R
      </span>
    </div>
  );
}
