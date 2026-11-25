/** 41×38 cream tile with a six-spoke asterisk glyph. */
export function LogoTile() {
  return (
    <div className="card flex h-[38px] w-[41px] shrink-0 items-center justify-center rounded-xl" aria-label="UniNotes">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#2E2D2A" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      </svg>
    </div>
  );
}
