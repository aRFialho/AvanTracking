import axios from 'axios';
import { OrderStatus } from '@prisma/client';

const SSW_TRACKING_BASE_URL = 'https://ssw.inf.br/app/tracking';
const SSW_DETAIL_URL = 'https://ssw.inf.br/2/SSWDetalhado';
const SSW_MIN_INTERVAL_MS = 1200;

type SswTrackingEvent = {
  status: string;
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

const resolveDetailUrlCandidates = (html: string) => {
  const candidates = new Set<string>();
  const normalizedHtml = String(html || '');
  const directMatches = normalizedHtml.matchAll(
    /https:\/\/ssw\.inf\.br\/2\/SSWDetalhado[^\s"'<>)]*/gi,
  );

  for (const match of directMatches) {
    if (match[0]) {
      candidates.add(decodeHtmlEntities(match[0]));
    }
  }

  const relativeMatches = normalizedHtml.matchAll(
    /\/2\/SSWDetalhado[^\s"'<>)]*/gi,
  );

  for (const match of relativeMatches) {
    if (match[0]) {
      candidates.add(`https://ssw.inf.br${decodeHtmlEntities(match[0])}`);
    }
  }

  const id = extractHiddenInputValue(normalizedHtml, 'id');
  const md = extractHiddenInputValue(normalizedHtml, 'md');
  if (id && md) {
    candidates.add(
      `${SSW_DETAIL_URL}?id=${encodeURIComponent(id)}&md=${encodeURIComponent(md)}`,
    );
  }

  candidates.add(SSW_DETAIL_URL);
  return Array.from(candidates);
};

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
    normalized.includes('emissão do ct-e')
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

      const cookieHeader = buildCookieHeader(sessionResponse.headers['set-cookie']);

      if (!cookieHeader) {
        return null;
      }

      const detailUrlCandidates = resolveDetailUrlCandidates(
        String(sessionResponse.data || ''),
      );

      let detailHtml = '';
      let detailUrlUsed = SSW_DETAIL_URL;

      for (const detailUrl of detailUrlCandidates) {
        const detailResponse = await axios.get<string>(detailUrl, {
          responseType: 'text',
          validateStatus: () => true,
          headers: {
            Accept: 'text/html',
            Referer: trackingUrl,
            Cookie: cookieHeader,
            'User-Agent': 'Mozilla/5.0 Avantracking/1.0',
          },
        });

        if (detailResponse.status < 200 || detailResponse.status >= 300) {
          continue;
        }

        const candidateHtml = String(detailResponse.data || '');
        const candidateText = stripHtml(candidateHtml).join(' | ');

        if (
          candidateText &&
          candidateText.length >= 20 &&
          !/cloudflare|forbidden|login|acesso negado|erro interno/i.test(
            candidateText,
          )
        ) {
          detailHtml = candidateHtml;
          detailUrlUsed = detailUrl;
          break;
        }
      }

      if (!detailHtml) {
        return null;
      }

      const htmlSnippet = detailHtml.slice(0, 12000);
      const lines = stripHtml(detailHtml);
      const text = lines.join(' | ');

      if (
        !text ||
        text.length < 20 ||
        /cloudflare|forbidden|login|acesso negado|erro interno/i.test(text)
      ) {
        return null;
      }

      const statusSource =
        lines.find((line) => mapSswStatusToEnum(line) !== null) || text;
      const status = mapSswStatusToEnum(statusSource);

      if (!status) {
        return null;
      }

      const carrierEstimatedDate = parseCarrierForecastFromText(text);
      const eventDate = parseLatestDateFromText(text);
      const description =
        lines.find((line) => /previs|entreg|tr[aâ]nsito|ocorr|colet|despach/i.test(line)) ||
        `Consulta SSW da NF ${normalizedInvoiceNumber}`;

      return {
        source: 'SSW' as const,
        status,
        carrierEstimatedDate,
        freightType: null,
        events: [
          {
            status: status,
            description,
            city: null,
            state: null,
            eventDate,
          },
        ],
        rawPayload: {
          trackingUrl: detailUrlUsed,
          htmlSnippet,
        },
      } satisfies SswTrackingResult;
    } catch (error) {
      console.error('Erro ao consultar SSW:', error);
      return null;
    }
  }
}

export const sswTrackingService = new SswTrackingService();
