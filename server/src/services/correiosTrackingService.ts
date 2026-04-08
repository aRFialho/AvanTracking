import { OrderStatus } from '@prisma/client';

const CORREIOS_API_BASE_URL =
  process.env.CORREIOS_API_BASE_URL?.trim() || 'https://api.correios.com.br';
const CORREIOS_DIRECT_TOKEN_URL =
  process.env.CORREIOS_DIRECT_TOKEN_URL?.trim() ||
  `${CORREIOS_API_BASE_URL}/token/v1/autentica`;
const CORREIOS_POSTING_CARD_TOKEN_URL =
  process.env.CORREIOS_POSTING_CARD_TOKEN_URL?.trim() ||
  `${CORREIOS_API_BASE_URL}/token/v1/autentica/cartaopostagem`;
const CORREIOS_TOKEN_URL =
  process.env.CORREIOS_TOKEN_URL?.trim() || '';
const CORREIOS_RASTRO_URL =
  process.env.CORREIOS_RASTRO_URL?.trim() ||
  `${CORREIOS_API_BASE_URL}/srorastro/v1/objetos`;
const CORREIOS_PUBLIC_TRACKING_BASE_URL =
  process.env.CORREIOS_PUBLIC_TRACKING_BASE_URL?.trim() ||
  'https://rastreamento.correios.com.br/app/index.php?objetos=';

const CORREIOS_API_USER =
  process.env.CORREIOS_API_USER?.trim() ||
  process.env.CORREIOS_USERNAME?.trim() ||
  '';
const CORREIOS_API_PASSWORD =
  process.env.CORREIOS_API_PASSWORD?.trim() ||
  process.env.CORREIOS_PASSWORD?.trim() ||
  '';
const CORREIOS_POSTING_CARD =
  process.env.CORREIOS_POSTING_CARD?.trim() ||
  process.env.CORREIOS_CARTAO_POSTAGEM?.trim() ||
  '';
const CORREIOS_CONTRACT =
  process.env.CORREIOS_CONTRACT?.trim() ||
  process.env.CORREIOS_CONTRATO?.trim() ||
  '';
const CORREIOS_DR = process.env.CORREIOS_DR?.trim() || '';
const CORREIOS_BEARER_TOKEN =
  process.env.CORREIOS_BEARER_TOKEN?.trim() ||
  process.env.CORREIOS_SUBDELEGATION_KEY?.trim() ||
  process.env.CORREIOS_API_KEY?.trim() ||
  '';

type CorreiosTrackingEvent = {
  status: string;
  description: string;
  city: string | null;
  state: string | null;
  eventDate: Date;
};

type CorreiosTrackingResult = {
  source: 'CORREIOS';
  status: OrderStatus;
  trackingUrl: string;
  objectCode: string;
  freightType: string;
  carrierEstimatedDate: Date | null;
  events: CorreiosTrackingEvent[];
  rawPayload: any;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

const normalizeDigits = (value: unknown) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

const normalizeAlphaNumeric = (value: unknown) =>
  String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

const normalizeComparableText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const safeString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const safeDate = (value: unknown) => {
  if (!value) return null;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseDateTimeParts = (dateValue: unknown, timeValue: unknown) => {
  const dateText = String(dateValue || '').trim();
  if (!dateText) {
    return null;
  }

  const dateMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!dateMatch) {
    return safeDate(dateText);
  }

  const timeText = String(timeValue || '').trim();
  const timeMatch = timeText.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const rawYear = Number(dateMatch[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const second = timeMatch?.[3] ? Number(timeMatch[3]) : 0;
  const parsed = new Date(year, month, day, hour, minute, second);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseCarrierForecastFromText = (text: string | null | undefined) => {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return null;

  const match = normalizedText.match(
    /previs[aã]o\s+de\s+entrega\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{2,4})/i,
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsedDate = new Date(year, month, day, 23, 59, 59, 999);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const mapCorreiosStatusToEnum = (value: string): OrderStatus => {
  const normalized = normalizeComparableText(value);

  if (!normalized) {
    return OrderStatus.PENDING;
  }

  if (normalized.includes('ENTREGUE')) {
    return OrderStatus.DELIVERED;
  }

  if (
    normalized.includes('SAIU PARA ENTREGA') ||
    normalized.includes('EM ROTA DE ENTREGA') ||
    normalized.includes('OBJETO SAIU PARA ENTREGA')
  ) {
    return OrderStatus.DELIVERY_ATTEMPT;
  }

  if (
    normalized.includes('DEVOLVIDO') ||
    normalized.includes('DEVOLUCAO') ||
    normalized.includes('OBJETO DEVOLVIDO')
  ) {
    return OrderStatus.RETURNED;
  }

  if (
    normalized.includes('TENTATIVA DE ENTREGA') ||
    normalized.includes('NAO ENTREGUE') ||
    normalized.includes('AGUARDANDO RETIRADA') ||
    normalized.includes('DESTINATARIO AUSENTE') ||
    normalized.includes('ENTREGA NAO REALIZADA')
  ) {
    return OrderStatus.FAILURE;
  }

  if (
    normalized.includes('EM TRANSITO') ||
    normalized.includes('ENCAMINHADO') ||
    normalized.includes('RECEBIDO NA UNIDADE') ||
    normalized.includes('UNIDADE DE TRATAMENTO') ||
    normalized.includes('OBJETO POSTADO') ||
    normalized.includes('POSTADO')
  ) {
    return OrderStatus.SHIPPED;
  }

  if (
    normalized.includes('PRE POSTADO') ||
    normalized.includes('PRE POSTAGEM') ||
    normalized.includes('AGUARDANDO POSTAGEM')
  ) {
    return OrderStatus.CREATED;
  }

  return OrderStatus.PENDING;
};

const extractNestedValue = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = path
      .split('.')
      .reduce<any>((current, key) => (current == null ? null : current[key]), source);

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

const getObjectPayload = (payload: any) => {
  if (Array.isArray(payload?.objetos) && payload.objetos.length > 0) {
    return payload.objetos[0];
  }

  if (Array.isArray(payload?.objeto) && payload.objeto.length > 0) {
    return payload.objeto[0];
  }

  if (payload?.objeto && typeof payload.objeto === 'object') {
    return payload.objeto;
  }

  return payload;
};

const buildPublicTrackingUrl = (objectCode: string) =>
  `${CORREIOS_PUBLIC_TRACKING_BASE_URL}${encodeURIComponent(objectCode)}`;

const isCorreiosCarrier = (carrierName: string | null | undefined) => {
  const normalized = normalizeComparableText(carrierName);
  if (!normalized) return false;

  return (
    normalized === 'CORREIOS' ||
    normalized.includes(' CORREIOS ') ||
    normalized.startsWith('CORREIOS ') ||
    normalized.endsWith(' CORREIOS') ||
    normalized.includes('SEDEX') ||
    normalized.includes('PAC')
  );
};

const looksLikeCorreiosObjectCode = (value: string | null | undefined) => {
  const normalized = normalizeAlphaNumeric(value);
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(normalized);
};

const isConfigured = () =>
  Boolean(CORREIOS_BEARER_TOKEN) ||
  Boolean(CORREIOS_API_USER && CORREIOS_API_PASSWORD);

const extractTokenFromResponse = (payload: any) =>
  safeString(payload?.token) ||
  safeString(payload?.jwt) ||
  safeString(payload?.access_token) ||
  safeString(payload?.accessToken) ||
  safeString(payload?.data?.token) ||
  safeString(payload?.data?.jwt) ||
  null;

const resolveTokenExpiryTimestamp = (payload: any) => {
  const dateCandidates = [
    payload?.expiraEm,
    payload?.data?.expiraEm,
    payload?.expiration,
    payload?.data?.expiration,
  ];

  for (const candidate of dateCandidates) {
    const parsed = safeDate(candidate);
    if (parsed) {
      return parsed.getTime();
    }
  }

  const numericCandidates = [
    payload?.expiresIn,
    payload?.expires_in,
    payload?.data?.expiresIn,
    payload?.data?.expires_in,
  ];

  for (const candidate of numericCandidates) {
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Date.now() + numericValue * 1000;
    }
  }

  return Date.now() + 10 * 60 * 1000;
};

class CorreiosTrackingService {
  private resolveTokenRequestConfig() {
    if (CORREIOS_TOKEN_URL) {
      return {
        url: CORREIOS_TOKEN_URL,
        body: CORREIOS_POSTING_CARD
          ? {
              numero: CORREIOS_POSTING_CARD,
              ...(CORREIOS_CONTRACT ? { contrato: CORREIOS_CONTRACT } : {}),
              ...(CORREIOS_DR ? { dr: Number(CORREIOS_DR) } : {}),
            }
          : undefined,
      };
    }

    if (CORREIOS_POSTING_CARD) {
      return {
        url: CORREIOS_POSTING_CARD_TOKEN_URL,
        body: {
          numero: CORREIOS_POSTING_CARD,
          ...(CORREIOS_CONTRACT ? { contrato: CORREIOS_CONTRACT } : {}),
          ...(CORREIOS_DR ? { dr: Number(CORREIOS_DR) } : {}),
        },
      };
    }

    return {
      url: CORREIOS_DIRECT_TOKEN_URL,
      body: undefined,
    };
  }

  isAvailable() {
    return isConfigured();
  }

  shouldUseForCarrier(carrierName: string | null | undefined) {
    return isCorreiosCarrier(carrierName);
  }

  buildTrackingUrl(objectCode: string | null | undefined) {
    const normalizedCode = normalizeAlphaNumeric(objectCode);
    if (!normalizedCode || !looksLikeCorreiosObjectCode(normalizedCode)) {
      return null;
    }
    return buildPublicTrackingUrl(normalizedCode);
  }

  private async getBearerToken() {
    if (CORREIOS_BEARER_TOKEN) {
      return CORREIOS_BEARER_TOKEN;
    }

    if (
      cachedToken &&
      cachedToken.expiresAt > Date.now() + 30 * 60 * 1000 &&
      cachedToken.value
    ) {
      return cachedToken.value;
    }

    if (!CORREIOS_API_USER || !CORREIOS_API_PASSWORD) {
      throw new Error('Credenciais dos Correios nao configuradas.');
    }

    const basicToken = Buffer.from(
      `${CORREIOS_API_USER}:${CORREIOS_API_PASSWORD}`,
      'utf-8',
    ).toString('base64');
    const { url, body } = this.resolveTokenRequestConfig();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      throw new Error(`Falha ao autenticar nos Correios: HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const token = extractTokenFromResponse(payload);

    if (!token) {
      throw new Error('Token dos Correios nao retornado pela API.');
    }

    cachedToken = {
      value: token,
      expiresAt: resolveTokenExpiryTimestamp(payload),
    };

    return token;
  }

  private parseEvents(payload: any): CorreiosTrackingEvent[] {
    const objectPayload = getObjectPayload(payload);
    const rawEvents = Array.isArray(objectPayload?.eventos)
      ? objectPayload.eventos
      : Array.isArray(payload?.eventos)
        ? payload.eventos
        : [];

    return rawEvents
      .map((event: any) => {
        const description =
          safeString(event?.descricaoFrontEnd) ||
          safeString(event?.descricao) ||
          safeString(event?.detalhe) ||
          safeString(event?.mensagem) ||
          'Evento de rastreamento';
        const city =
          safeString(
            extractNestedValue(event, [
              'unidade.endereco.cidade',
              'unidade.endereco.cidadeLocalidade',
              'unidade.cidade',
              'cidade',
              'local',
            ]),
          ) || null;
        const state =
          safeString(
            extractNestedValue(event, [
              'unidade.endereco.uf',
              'unidade.endereco.siglaUf',
              'unidade.uf',
              'uf',
            ]),
          ) || null;
        const eventDate =
          safeDate(
            extractNestedValue(event, [
              'dtHrCriado',
              'dataHora',
              'data',
              'date',
            ]),
          ) ||
          parseDateTimeParts(event?.dtHrCriado, event?.hora) ||
          parseDateTimeParts(event?.data, event?.hora) ||
          new Date();

        return {
          status:
            safeString(event?.tipo) ||
            safeString(event?.codigo) ||
            mapCorreiosStatusToEnum(description),
          description,
          city,
          state: state ? state.toUpperCase().slice(0, 2) : null,
          eventDate,
        } as CorreiosTrackingEvent;
      })
      .sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime());
  }

  async fetchTrackingByObjectCode(
    objectCode: string | null | undefined,
    carrierName: string | null | undefined,
  ): Promise<CorreiosTrackingResult | null> {
    if (!this.shouldUseForCarrier(carrierName)) {
      return null;
    }

    const normalizedCode = normalizeAlphaNumeric(objectCode);
    if (!normalizedCode || !looksLikeCorreiosObjectCode(normalizedCode)) {
      return null;
    }

    if (!this.isAvailable()) {
      throw new Error('Integracao dos Correios nao configurada.');
    }

    const token = await this.getBearerToken();
    const response = await fetch(
      `${CORREIOS_RASTRO_URL}/${encodeURIComponent(normalizedCode)}?resultado=T`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }

      throw new Error(`Falha ao consultar rastreio dos Correios: HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    if (!payload) {
      return null;
    }

    const events = this.parseEvents(payload);
    const objectPayload = getObjectPayload(payload);
    const latestEvent = events[0] || null;
    const status =
      latestEvent?.description
        ? mapCorreiosStatusToEnum(latestEvent.description)
        : mapCorreiosStatusToEnum(
            String(
              extractNestedValue(objectPayload, [
                'descricaoSituacao',
                'situacao',
                'status',
              ]) || '',
            ),
          );
    const carrierEstimatedDate =
      safeDate(
        extractNestedValue(objectPayload, [
          'previsaoEntrega',
          'prazoEntrega',
          'expectedDeliveryDate',
        ]),
      ) ||
      events.reduce<Date | null>((current, event) => {
        return current || parseCarrierForecastFromText(event.description);
      }, null);

    return {
      source: 'CORREIOS',
      status,
      trackingUrl: buildPublicTrackingUrl(normalizedCode),
      objectCode: normalizedCode,
      freightType: 'Correios',
      carrierEstimatedDate,
      events,
      rawPayload: payload,
    };
  }
}

export const correiosTrackingService = new CorreiosTrackingService();
export { isCorreiosCarrier, looksLikeCorreiosObjectCode };
