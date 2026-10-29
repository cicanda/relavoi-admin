// Relavoi brand assets live in /public/brand. The wordmark comes in two
// variants: "on-dark" has white lettering for dark surfaces (every surface in
// this console today), "on-light" has navy lettering for clean white surfaces.
const WORDMARK_RATIO = 26162.82 / 7394.4;

export function BrandLogo({
  height = 32,
  surface = "dark",
}: {
  height?: number;
  surface?: "dark" | "light";
}) {
  return (
    <img
      src={surface === "dark" ? "/brand/logo-on-dark.svg" : "/brand/logo-on-light.svg"}
      alt="Relavoi"
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      className="block flex-shrink-0"
      style={{ height, width: "auto" }}
    />
  );
}

// Square app mark (same artwork as the favicon) for spaces too narrow for the
// wordmark, e.g. the collapsed sidebar.
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/brand/mark.svg"
      alt="Relavoi"
      width={size}
      height={size}
      className="block flex-shrink-0"
    />
  );
}
