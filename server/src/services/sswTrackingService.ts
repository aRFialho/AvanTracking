import axios from 'axios';
import { OrderStatus } from '@prisma/client';

const SSW_TRACKING_BASE_URL = 'https://ssw.inf.br/app/tracking';
const SSW_REGISTER_URL = 'https://ssw.inf.br/2/Tracking';
const SSW_SELECT_URL = 'https://ssw.inf.br/2/SelecionarDocumento';
const SSW_DETAIL_URL = 'https://ssw.inf.br/2/SSWDetalhado';
const SSW_MIN_INTERVAL_MS = 1200;

type SswTrackingEvent = {
  status: OrderStatus;
  description: string;
  city: string | null;
  state: string | null;
  eventDate: Date;
};

export type SswTrackingResult = {
  source: 'SSW';
  status: OrderStatus;
  carrierEstimatedDate: Date | null;
  freightType: string | null;
  events: SswTrackingEvent[];
  rawPayload: {
    trackingUrl: string;
    htmlSnippet: string;
  };
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const stripHtml = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n'),
  )
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const buildCookieHeader = (setCookieHeaders: string[] | undefined) => {
  if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) {
    return '';
  }

  return setCookieHeaders
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
};

const extractHiddenInputValue = (html: string, inputName: string) => {
  const patterns = [
    new RegExp(
      `<input[^>]*name=["']${inputName}["'][^>]*value=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<input[^>]*value=["']([^"']+)["'][^>]*name=["']${inputName}["'][^>]*>`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
};

const extractSelectionCandidates = (html: string) => {
  const candidates = new Set<string>();
  const normalizedHtml = String(html || '');
  const patterns = [
    /SelecionarDocumento\(['"]?([^'")\s]+)['"]?/gi,
    /selecionarDocumento\(['"]?([^'")\s]+)['"]?/gi,
    /data-id=["']([^"']+)["']/gi,
    /name=["']id["'][^>]*value=["']([^"']+)["']/gi,
    /value=["']([^"']+)["'][^>]*name=["']id["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalizedHtml.matchAll(pattern)) {
      if (match[1]) {
        candidates.add(decodeHtmlEntities(String(match[1]).trim()));
      }
    }
  }

  return Array.from(candidates);
};

const buildAjaxHeaders = (cookieHeader: string, referer: string) => ({
  Accept: 'text/html, */*;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Cookie: cookieHeader,
  Referer: referer,
  'User-Agent': 'Mozilla/5.0 Avantracking/1.0',
  'X-Requested-With': 'XMLHttpRequest',
});

const hasTrackingMarkers = (text: string) =>
  /documento de transporte emitido|saida de unidade|sa[ií]da de unidade|chegada em unidade|mercadoria entregue|previs[aã]o de entrega|em tr[aâ]nsito|ocorr|insucesso|entregue|despachado/i.test(
    text,
  );

const hasDirectTrackingTable = (html: string) =>
  /Data\/Hora|Situa[cç][aã]o|class=["']titulo["']/i.test(String(html || ''));

const parseCarrierForecastFromText = (text: string) => {
  const match = text.match(
    /previs[aã]o\s+de\s+entrega\s*:?\s*(\d{2})\/(\d{2})\/(\d{2,4})/i,
  );

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsedDate = new Date(year, month, day, 23, 59, 59, 999);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const parseLatestDateFromText = (text: string) => {
  const matches = Array.from(
    text.matchAll(
      /(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/g,
    ),
  );

  if (matches.length === 0) {
    return new Date();
  }

  const latest = matches
    .map((match) => {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const rawYear = Number(match[3]);
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      const hours = Number(match[4] || 0);
      const minutes = Number(match[5] || 0);
      const seconds = Number(match[6] || 0);
      return new Date(year, month, day, hours, minutes, seconds, 0);
    })
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return latest || new Date();
};

const mapSswStatusToEnum = (text: string): OrderStatus | null => {
  const normalized = text.toLowerCase();

  if (normalized.includes('entregue')) return OrderStatus.DELIVERED;
  if (normalized.includes('saiu para entrega')) {
    return OrderStatus.DELIVERY_ATTEMPT;
  }
  if (
    normalized.includes('ocorr') ||
    normalized.includes('insucesso') ||
    normalized.includes('nao entregue') ||
    normalized.includes('não entregue') ||
    normalized.includes('falha')
  ) {
    return OrderStatus.FAILURE;
  }
  if (normalized.includes('devol')) return OrderStatus.RETURNED;
  if (normalized.includes('cancel')) return OrderStatus.CANCELED;
  if (
    normalized.includes('em trânsito') ||
    normalized.includes('em transito') ||
    normalized.includes('despach') ||
    normalized.includes('ct-e autorizado') ||
    normalized.includes('transfer') ||
    normalized.includes('emissao do ct-e') ||
    normalized.includes('emissão do ct-e') ||
    normalized.includes('documento de transporte emitido') ||
    normalized.includes('chegada em unidade')
  ) {
    return OrderStatus.SHIPPED;
  }
  if (
    normalized.includes('coletad') ||
    normalized.includes('criad') ||
    normalized.includes('emitid')
  ) {
    return OrderStatus.CREATED;
  }

  return null;
};

const extractSswEvents = (html: string): SswTrackingEvent[] => {
  const rowPattern =
    /<tr[^>]*style=["'][^"']*background-color:[^"']*["'][^>]*>\s*<td[^>]*>\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>\s*<\/td>\s*<td[^>]*>\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>\s*<\/td>\s*<td[^>]*>\s*(?:<b>\s*)?<p[^>]*class=["']titulo["'][^>]*>\s*([\s\S]*?)\s*<\/p>(?:\s*<\/b>)?\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>\s*<\/td>\s*<\/tr>/gi;

  const events: SswTrackingEvent[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const rawDate = stripHtml(match[1] || '').join(' ').replace(/\s+/g, ' ').trim();
    const rawUnit = stripHtml(match[2] || '').join(' ').replace(/\s+/g, ' ').trim();
    const rawTitle = stripHtml(match[3] || '').join(' ').replace(/\s+/g, ' ').trim();
    const rawDescription = stripHtml(match[4] || '').join(' ').replace(/\s+/g, ' ').trim();
    const status = mapSswStatusToEnum(`${rawTitle} ${rawDescription}`);

    if (!status) {
      continue;
    }

    const eventDate = parseLatestDateFromText(rawDate || rawDescription);
    const unitParts = rawUnit
      .split('/')
      .map((part) => part.replace(/\bMID\b.*$/i, '').replace(/\u00a0/g, ' ').trim())
      .filter(Boolean);

    events.push({
      status,
      description: [rawTitle, rawDescription].filter(Boolean).join(' - '),
      city: unitParts[0] || null,
      state: unitParts[1] ? unitParts[1].slice(0, 2).trim() : null,
      eventDate,
    });
  }

  return events;
};

const buildResultFromHtml = (
  html: string,
  trackingUrl: string,
  invoiceNumber: string,
): SswTrackingResult | null => {
  const normalizedHtml = String(html || '');
  const htmlSnippet = normalizedHtml.slice(0, 12000);
  const lines = stripHtml(normalizedHtml);
  const text = lines.join(' | ');

  if (
    !text ||
    text.length < 20 ||
    !hasTrackingMarkers(text) ||
    /cloudflare|forbidden|login|acesso negado|erro interno/i.test(text)
  ) {
    return null;
  }

  const events = extractSswEvents(normalizedHtml);

  if (events.length === 0) {
    const statusSource =
      lines.find((line) => mapSswStatusToEnum(line) !== null) || text;
    const status = mapSswStatusToEnum(statusSource);

    if (!status) {
      return null;
    }

    events.push({
      status,
      description:
        lines.find((line) =>
          /previs|entreg|tr[aãâ]nsito|ocorr|colet|despach|chegada|saida|documento/i.test(
            line,
          ),
        ) || `Consulta SSW da NF ${invoiceNumber}`,
      city: null,
      state: null,
      eventDate: parseLatestDateFromText(text),
    });
  }

  const latestEvent = events
    .slice()
    .sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime())[0];

  return {
    source: 'SSW',
    status: latestEvent.status,
    carrierEstimatedDate: parseCarrierForecastFromText(text),
    freightType: null,
    events,
    rawPayload: {
      trackingUrl,
      htmlSnippet,
    },
  };
};

const buildRegisterPayload = (
  sessionHtml: string,
  normalizedCnpj: string,
  normalizedInvoiceNumber: string,
) => {
  const payload = new URLSearchParams();
  payload.set('tipo', 'tracking');

  const n = extractHiddenInputValue(sessionHtml, 'n') || normalizedInvoiceNumber;
  const c = extractHiddenInputValue(sessionHtml, 'c') || normalizedCnpj;
  const serie = extractHiddenInputValue(sessionHtml, 'serie');
  const chave = extractHiddenInputValue(sessionHtml, 'chave');

  if (n) payload.set('n', n);
  if (c) payload.set('c', c);
  if (serie) payload.set('serie', serie);
  if (chave) payload.set('chave', chave);

  return payload;
};

const looksLikeSelectionList = (html: string) =>
  /selecionar|conhecimento|documento|lista|escolha|clique/i.test(
    stripHtml(String(html || '')).join(' | '),
  );

class SswTrackingService {
  private lastRequestAt = 0;

  private async throttle() {
    const waitMs = Math.max(0, this.lastRequestAt + SSW_MIN_INTERVAL_MS - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }

  async fetchTrackingByInvoice(cnpj: string, invoiceNumber: string) {
    const normalizedCnpj = String(cnpj || '').replace(/\D/g, '').trim();
    const normalizedInvoiceNumber = String(invoiceNumber || '').replace(/\D/g, '').trim();

    if (!normalizedCnpj || !normalizedInvoiceNumber) {
      return null;
    }

    const trackingUrl = `${SSW_TRACKING_BASE_URL}/${normalizedCnpj}/${normalizedInvoiceNumber}`;

    try {
      await this.throttle();

      const sessionResponse = await axios.get<string>(trackingUrl, {
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: () => true,
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 Avantracking/1.0',
        },
      });

      if (sessionResponse.status < 200 || sessionResponse.status >= 300) {
        return null;
      }

      const sessionHtml = String(sessionResponse.data || '');
      if (hasDirectTrackingTable(sessionHtml)) {
        const directResult = buildResultFromHtml(
          sessionHtml,
          trackingUrl,
          normalizedInvoiceNumber,
        );

        if (directResult) {
          return directResult;
        }
      }

      const cookieHeader = buildCookieHeader(sessionResponse.headers['set-cookie']);

      if (!cookieHeader) {
        return null;
      }

      const registerPayload = buildRegisterPayload(
        String(sessionResponse.data || ''),
        normalizedCnpj,
        normalizedInvoiceNumber,
      );

      const registerResponse = await axios.post<string>(
        SSW_REGISTER_URL,
        registerPayload.toString(),
        {
          responseType: 'text',
          validateStatus: () => true,
          headers: buildAjaxHeaders(cookieHeader, SSW_TRACKING_BASE_URL),
        },
      );

      if (registerResponse.status >= 200 && registerResponse.status < 300) {
        const registerHtml = String(registerResponse.data || '');
        const registeredResult = buildResultFromHtml(
          registerHtml,
          SSW_REGISTER_URL,
          normalizedInvoiceNumber,
        );

        if (registeredResult) {
          return registeredResult;
        }

        if (looksLikeSelectionList(registerHtml)) {
          const selectionCandidates = extractSelectionCandidates(registerHtml);

          for (const candidate of selectionCandidates) {
            const selectionPayloads = [
              new URLSearchParams({ id: candidate }),
              new URLSearchParams({ documento: candidate }),
              new URLSearchParams({ id: candidate, documento: candidate }),
            ];

            for (const selectionPayload of selectionPayloads) {
              const selectionResponse = await axios.post<string>(
                SSW_SELECT_URL,
                selectionPayload.toString(),
                {
                  responseType: 'text',
                  validateStatus: () => true,
                  headers: buildAjaxHeaders(cookieHeader, SSW_TRACKING_BASE_URL),
                },
              );

              if (
                selectionResponse.status < 200 ||
                selectionResponse.status >= 300
              ) {
                continue;
              }

              const selectedResult = buildResultFromHtml(
                String(selectionResponse.data || ''),
                SSW_SELECT_URL,
                normalizedInvoiceNumber,
              );

              if (selectedResult) {
                return selectedResult;
              }
            }
          }
        }
      }

      const detailResponse = await axios.get<string>(SSW_DETAIL_URL, {
        responseType: 'text',
        validateStatus: () => true,
        headers: {
          Accept: 'text/html',
          Referer: SSW_TRACKING_BASE_URL,
          Cookie: cookieHeader,
          'User-Agent': 'Mozilla/5.0 Avantracking/1.0',
        },
      });

      if (detailResponse.status < 200 || detailResponse.status >= 300) {
        return null;
      }

      return buildResultFromHtml(
        String(detailResponse.data || ''),
        SSW_DETAIL_URL,
        normalizedInvoiceNumber,
      );
    } catch (error) {
      console.error('Erro ao consultar SSW:', error);
      return null;
    }
  }
}

export const sswTrackingService = new SswTrackingService();
