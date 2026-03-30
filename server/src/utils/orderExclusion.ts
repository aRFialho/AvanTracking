const normalizeFreightText = (freightType: string | null | undefined) =>
  String(freightType || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const normalizeExcludedPlatformFreight = (
  freightType: string | null | undefined,
) => {
  const normalized = normalizeFreightText(freightType);

  if (!normalized) return null;

  if (
    [
      'coletasme2',
      'encomenda normal',
      'normal ao endereço',
      'normal ao endereco',
      'padrão ao endereço',
      'padrao ao endereco',
    ].includes(normalized) ||
    normalized.includes('priorit')
  ) {
    return 'ColetasME2';
  }

  if (['shopee xpress', 'retirada pelo comprador'].includes(normalized)) {
    return 'Shopee Xpress';
  }

  if (
    ['retirada normal na agencia', 'retirada na agencia'].includes(normalized)
  ) {
    return 'Retirada na Agencia';
  }

  if (
    normalized.includes('correios') ||
    normalized.includes('sedex') ||
    normalized === 'pac' ||
    normalized.startsWith('pac ') ||
    normalized.endsWith(' pac') ||
    normalized.includes(' pac ') ||
    normalized.includes('pac tray')
  ) {
    return 'Correios';
  }

  return null;
};

export const isExcludedPlatformFreight = (
  freightType: string | null | undefined,
) => Boolean(normalizeExcludedPlatformFreight(freightType));
