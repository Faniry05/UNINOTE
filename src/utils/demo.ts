/** Demo-mode flag, set once from /api/auth/status at boot (see App.tsx). */
let demoMode = false;

export function setDemoMode(value: boolean): void {
  demoMode = value;
}

export function isDemoMode(): boolean {
  return demoMode;
}
