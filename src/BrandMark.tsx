export default function BrandMark() {
  return (
    <svg
      className="brand-symbol"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 6h6l6 8-6 8H5M17 6h6M17 22h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="6" r="2" fill="currentColor" />
      <circle cx="5" cy="22" r="2" fill="currentColor" />
      <circle cx="23" cy="6" r="2" fill="currentColor" />
      <circle cx="23" cy="22" r="2" fill="currentColor" />
    </svg>
  );
}
