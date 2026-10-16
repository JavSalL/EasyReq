// Catálogo de países para el perfil del usuario. Se guarda el código ISO 3166-1 alfa-2
// (estable, no depende del idioma) y el nombre en español se obtiene con `Intl.DisplayNames`,
// así no hay que mantener a mano una lista de nombres.

const CODIGOS_PAIS = [
  'AD', 'AE', 'AF', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF',
  'BG', 'BH', 'BI', 'BJ', 'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CD', 'CF', 'CG',
  'CH', 'CI', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO',
  'DZ', 'EC', 'EE', 'EG', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FM', 'FR', 'GA', 'GB', 'GD', 'GE', 'GH',
  'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IN',
  'IQ', 'IR', 'IS', 'IT', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW',
  'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME',
  'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MR', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NZ', 'OM', 'PA', 'PE', 'PG', 'PH', 'PK', 'PL', 'PR',
  'PS', 'PT', 'PW', 'PY', 'QA', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SI',
  'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SY', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL',
  'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE',
  'VN', 'VU', 'WS', 'XK', 'YE', 'ZA', 'ZM', 'ZW'
] as const;

export interface Pais {
  codigo: string;
  nombre: string;
}

let cache: Pais[] | null = null;

/** Países ordenados alfabéticamente por su nombre en español. */
export function getPaises(): Pais[] {
  if (cache) return cache;
  let nombres: Intl.DisplayNames | null = null;
  try {
    nombres = new Intl.DisplayNames(['es'], { type: 'region' });
  } catch {
    nombres = null;
  }
  cache = CODIGOS_PAIS
    .map((codigo) => ({ codigo, nombre: nombres?.of(codigo) ?? codigo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return cache;
}

/** Nombre en español de un código de país, o null si no se reconoce. */
export function nombrePais(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return getPaises().find((p) => p.codigo === codigo)?.nombre ?? null;
}
