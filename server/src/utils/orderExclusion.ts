const normalizeFreightText = (freightType: string | null | undefined) =>
  String(freightType || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const DROSSI_CHANNEL_LOGISTICS_COMPANY = 'drossi interiores';

const CHANNEL_MANAGED_FREIGHT_ALIASES: Array<{
  match: (normalized: string) => boolean;
  label: string;
}> = [
  {
    match: (normalized) =>
      [
        'coletasme2',
        'encomenda normal',
        'normal ao endereco',
        'padrao ao endereco',
      ].includes(normalized) || normalized.includes('priorit'),
    label: 'ColetasME2',
  },
  {
    match: (normalized) =>
      ['shopee xpress', 'retirada pelo comprador'].includes(normalized),
    label: 'Shopee Xpress',
  },
  {
    match: (normalized) =>
      normalized.includes('correios') ||
      normalized.includes('sedex') ||
      normalized === 'pac' ||
      normalized.startsWith('pac ') ||
      normalized.endsWith(' pac') ||
      normalized.includes(' pac ') ||
      normalized.includes('pac tray'),
    label: 'Correios',
  },
];

const DEFAULT_IMPORT_EXCEPTION_ALIASES = [
  'retirada normal na agencia',
  'retirada na agencia',
];

export const normalizeCarrierExceptionList = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => normalizeFreightText(String(item || '')))
        .filter(Boolean),
    ),
  );
};

export const shouldApplyChannelLogisticsRules = (
  companyName: string | null | undefined,
) => normalizeFreightText(companyName) === DROSSI_CHANNEL_LOGISTICS_COMPANY;

export const normalizeExcludedPlatformFreight = (
  freightType: string | null | undefined,
  companyName?: string | null,
) => {
  if (!shouldApplyChannelLogisticsRules(companyName)) {
    return null;
  }

  const normalized = normalizeFreightText(freightType);
  if (!normalized) return null;

  for (const alias of CHANNEL_MANAGED_FREIGHT_ALIASES) {
    if (alias.match(normalized)) {
      return alias.label;
    }
  }

  return null;
};

export const shouldSkipPlatformOrderImport = ({
  freightType,
  carrierExceptions,
}: {
  freightType: string | null | undefined;
  carrierExceptions?: string[] | null | undefined;
}) => {
  const normalized = normalizeFreightText(freightType);
  if (!normalized) return false;

  const normalizedExceptions = new Set([
    ...DEFAULT_IMPORT_EXCEPTION_ALIASES,
    ...normalizeCarrierExceptionList(carrierExceptions),
  ]);

  return normalizedExceptions.has(normalized);
};

export const isExcludedPlatformFreight = (
  freightType: string | null | undefined,
  companyName?: string | null,
) => Boolean(normalizeExcludedPlatformFreight(freightType, companyName));
