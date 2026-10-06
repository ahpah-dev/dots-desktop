/** Shared product mark, matching assets/logo.svg and the Windows app icon. */
export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#35785c" />
      <circle cx="22" cy="22" r="7.5" fill="#fbfaf7" />
      <circle cx="42" cy="22" r="7.5" fill="#fbfaf7" />
      <circle cx="22" cy="42" r="7.5" fill="#c5dcc8" />
      <circle cx="42" cy="42" r="7.5" fill="#99c6ad" />
    </svg>
  );
}
