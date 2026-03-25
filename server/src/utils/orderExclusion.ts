const normalizeFreightText = (freightType: string | null | undefined) =>
  String(freightType || '').trim().toLowerCase();

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
    normalized.includes('sedex') ||
    normalized.includes('correios pac') ||
    normalized === 'pac' ||
    normalized.includes(' pac ')
  ) {
    return 'Correios';
  }

  return null;
};

export const isExcludedPlatformFreight = (
  freightType: string | null | undefined,
) => Boolean(normalizeExcludedPlatformFreight(freightType));
