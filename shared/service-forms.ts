/**
 * Service-specific request fields, shared by the counter form (frontend)
 * and the server-side validation. Prices are NOT defined here: they live in
 * the `services` table and are always read from the API.
 */

export interface ServiceFieldOption {
  value: string;
  label: string;
}

export interface ServiceFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number';
  required: boolean;
  placeholder?: string;
  options?: ServiceFieldOption[];
}

export const ATTESTATION_TYPES: ServiceFieldOption[] = [
  { value: 'SCOLARITE', label: 'Attestation de scolarité' },
  { value: 'INSCRIPTION', label: 'Attestation d’inscription' },
  { value: 'REUSSITE', label: 'Attestation de réussite' },
];

const ACADEMIC_YEAR_FIELD: ServiceFieldDefinition = {
  key: 'academicYear',
  label: 'Année universitaire',
  type: 'text',
  required: true,
  placeholder: 'Ex. 2025-2026',
};

export const SERVICE_FIELDS: Record<string, ServiceFieldDefinition[]> = {
  ATTESTATION: [
    ACADEMIC_YEAR_FIELD,
    { key: 'attestationType', label: 'Type d’attestation', type: 'select', required: true, options: ATTESTATION_TYPES },
    { key: 'purpose', label: 'Motif / destinataire (optionnel)', type: 'text', required: false, placeholder: 'Ex. Dossier de bourse' },
  ],
  RELEVE_NOTES: [
    ACADEMIC_YEAR_FIELD,
    { key: 'semester', label: 'Semestre(s) concerné(s)', type: 'text', required: true, placeholder: 'Ex. S5 ou S5-S6' },
  ],
  CERTIFICATION: [
    { key: 'documentToCertify', label: 'Document à certifier', type: 'text', required: true, placeholder: 'Ex. Copie du diplôme de licence' },
    { key: 'copies', label: 'Nombre d’exemplaires', type: 'number', required: true, placeholder: '1' },
  ],
};

/** Returns the field definitions for a service code (custom services get none). */
export function getServiceFields(serviceCode: string): ServiceFieldDefinition[] {
  return SERVICE_FIELDS[serviceCode] ?? [];
}

/**
 * Validates and normalises the `details` payload of a sale.
 * Returns either the cleaned details or an error message.
 */
export function validateServiceDetails(
  serviceCode: string,
  raw: unknown
): { ok: true; details: Record<string, string> } | { ok: false; error: string } {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields = getServiceFields(serviceCode);
  const details: Record<string, string> = {};

  for (const field of fields) {
    const value = input[field.key];
    const str = typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 200) : '';
    if (!str) {
      if (field.required) return { ok: false, error: `Le champ « ${field.label} » est obligatoire.` };
      continue;
    }
    if (field.type === 'select' && field.options && !field.options.some((o) => o.value === str)) {
      return { ok: false, error: `Valeur invalide pour « ${field.label} ».` };
    }
    if (field.type === 'number') {
      const n = Number(str);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return { ok: false, error: `« ${field.label} » doit être un entier entre 1 et 20.` };
      }
    }
    details[field.key] = str;
  }

  return { ok: true, details };
}
