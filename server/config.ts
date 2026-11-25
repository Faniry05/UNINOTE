/**
 * Runtime configuration shared by the server modules.
 *
 * Demo mode is enabled with `DEMO_MODE=true` or the `--demo` CLI flag
 * (see `npm run demo`). In demo mode the server uses a separate database
 * file, seeds demo accounts and clearly-identified fictitious data, and
 * exposes the demo reset endpoint. It must never be enabled in production.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.argv.includes('--demo');
}

export function getInstitutionName(): string {
  return process.env.INSTITUTION_NAME?.trim() || 'Université — Service de la Scolarité';
}
