import axios from 'axios';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

interface TrayAuthResponse {
  message?: string;
  code?: string;
  access_token: string;
  refresh_token?: string;
  date_expiration: string;
  date_expiration_access_token?: string;
  date_expiration_refresh_token?: string;
  date_activated?: string;
  api_host: string;
  store_id?: string | number;
}

interface TrayCompanyContextPayload {
  type: 'tray-company-context';
  companyId: string;
  userId: string;
}

export class TrayAuthService {
  private consumerKey: string;
  private consumerSecret: string;
  private jwtSecret: string;
  private authCache = new Map<
    string,
    { accessToken: string; apiAddress: string; expiresAt: Date }
  >();
  private refreshLocks = new Map<
    string,
    Promise<{ accessToken: string; apiAddress: string; expiresAt: Date } | null>
  >();

  constructor() {
    this.consumerKey = process.env.TRAY_CONSUMER_KEY || '';
    this.consumerSecret = process.env.TRAY_CONSUMER_SECRET || '';
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  }

  normalizeStoreUrl(storeUrl: string): string {
    let normalized = String(storeUrl || '').trim();

    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    normalized = normalized.replace(/\/+$/, '');
    normalized = normalized.replace(/\/web_api$/i, '');

    return normalized;
  }

  normalizeApiAddress(apiAddress: string): string {
    let normalized = String(apiAddress || '').trim();

    if (!normalized) {
      return '';
    }

    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    normalized = normalized.replace(/\/+$/, '');

    if (!/\/web_api$/i.test(normalized)) {
      normalized = `${normalized}/web_api`;
    }

    return normalized;
  }

  private buildCallbackUrl(companyToken?: string) {
    const configuredCallbackUrl = String(process.env.TRAY_CALLBACK_URL || '').trim();
    if (!configuredCallbackUrl) {
      return '';
    }

    const callbackUrl = new URL(configuredCallbackUrl);
    if (companyToken) {
      callbackUrl.searchParams.set('company_token', companyToken);
    }

    return callbackUrl.toString();
  }

  signCompanyContext(companyId: string, userId: string) {
    return jwt.sign(
      {
        type: 'tray-company-context',
        companyId,
        userId,
      } satisfies TrayCompanyContextPayload,
      this.jwtSecret,
      { expiresIn: '2h' },
    );
  }

  verifyCompanyContext(token: string): TrayCompanyContextPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        decoded.type !== 'tray-company-context' ||
        typeof decoded.companyId !== 'string' ||
        typeof decoded.userId !== 'string'
      ) {
        return null;
      }

      return {
        type: 'tray-company-context',
        companyId: decoded.companyId,
        userId: decoded.userId,
      };
    } catch {
      return null;
    }
  }

  getAuthorizationUrl(storeUrl: string, options?: { companyToken?: string }): string {
    const callbackUrl = encodeURIComponent(
      this.buildCallbackUrl(options?.companyToken),
    );
    const normalizedStoreUrl = this.normalizeStoreUrl(storeUrl);

    return `${normalizedStoreUrl}/auth.php?response_type=code&consumer_key=${this.consumerKey}&callback=${callbackUrl}`;
  }

  async generateAccessToken(
    code: string,
    apiAddress: string,
  ): Promise<TrayAuthResponse> {
    try {
      console.log('Gerando access_token da Tray...');
      const normalizedApiAddress = this.normalizeApiAddress(apiAddress);

      if (!normalizedApiAddress) {
        throw new Error('api_address invalido para gerar token da Tray.');
      }

      const body = new URLSearchParams();
      body.set('consumer_key', this.consumerKey);
      body.set('consumer_secret', this.consumerSecret);
      body.set('code', code);

      const response = await axios.post(`${normalizedApiAddress}/auth`, body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      console.log('Access token da Tray gerado com sucesso');
      return response.data;
    } catch (error: any) {
      console.error(
        'Erro ao gerar access_token da Tray:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Erro ao gerar token: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async refreshAccessToken(
    refreshToken: string,
    apiAddress: string,
  ): Promise<TrayAuthResponse> {
    const normalizedApiAddress = this.normalizeApiAddress(apiAddress);

    if (!normalizedApiAddress) {
      throw new Error('api_address invalido para renovar token da Tray.');
    }

    try {
      console.log('Renovando access_token da Tray...');

      const response = await axios.get(`${normalizedApiAddress}/auth`, {
        params: {
          refresh_token: refreshToken,
        },
      });

      console.log('Access token da Tray renovado com sucesso');
      return response.data;
    } catch (error: any) {
      console.error(
        'Erro ao renovar access_token da Tray via GET:',
        error.response?.data || error.message,
      );

      try {
        const body = new URLSearchParams();
        body.set('consumer_key', this.consumerKey);
        body.set('consumer_secret', this.consumerSecret);
        body.set('refresh_token', refreshToken);

        const fallbackResponse = await axios.post(
          `${normalizedApiAddress}/auth`,
          body.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        );

        console.log('Access token da Tray renovado com sucesso via POST fallback');
        return fallbackResponse.data;
      } catch (fallbackError: any) {
        console.error(
          'Erro ao renovar access_token da Tray:',
          fallbackError.response?.data || fallbackError.message,
        );
        throw new Error(
          `Erro ao renovar token: ${fallbackError.response?.data?.message || fallbackError.message}`,
        );
      }
    }
  }

  async saveAuth(companyId: string, authData: {
    storeId: string;
    apiAddress: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    code?: string;
    storeName?: string;
  }) {
    const saved = await prisma.trayAuth.upsert({
      where: { companyId },
      create: {
        companyId,
        storeId: authData.storeId,
        storeName: authData.storeName,
        apiAddress: authData.apiAddress,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        code: authData.code,
        expiresAt: authData.expiresAt,
      },
      update: {
        storeId: authData.storeId,
        storeName: authData.storeName,
        apiAddress: authData.apiAddress,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        code: authData.code,
        expiresAt: authData.expiresAt,
      },
    });

    this.authCache.set(companyId, {
      accessToken: saved.accessToken,
      apiAddress: this.normalizeApiAddress(saved.apiAddress),
      expiresAt: saved.expiresAt,
    });

    return saved;
  }

  async getValidAuth(companyId: string): Promise<string | null> {
    const authData = await this.getValidAuthData(companyId);
    return authData?.accessToken || null;
  }

  async getValidAuthData(companyId: string) {
    const cached = this.authCache.get(companyId);
    if (cached && !this.isExpired(cached.expiresAt)) {
      return cached;
    }

    const pendingRefresh = this.refreshLocks.get(companyId);
    if (pendingRefresh) {
      return pendingRefresh;
    }

    const refreshPromise = this.resolveValidAuthData(companyId);
    this.refreshLocks.set(companyId, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.refreshLocks.delete(companyId);
    }
  }

  async getAuthData(companyId: string) {
    return await prisma.trayAuth.findUnique({
      where: { companyId },
    });
  }

  async getCompaniesWithAuth() {
    const authRows = await prisma.trayAuth.findMany({
      where: {
        companyId: {
          not: null,
        },
      },
      select: {
        companyId: true,
      },
    });

    return authRows
      .map((row) => row.companyId)
      .filter((companyId): companyId is string => Boolean(companyId));
  }

  async getCurrentAuth(companyId: string, storeId?: string) {
    const auth = await this.getAuthData(companyId);

    if (!auth) {
      return null;
    }

    if (storeId && auth.storeId !== storeId) {
      return null;
    }

    return auth;
  }

  parseExpirationDate(dateStr: string): Date {
    const normalized = String(dateStr || '').trim();

    if (!normalized) {
      return new Date(Date.now() + 5 * 60 * 1000);
    }

    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) {
      return new Date(normalized.replace(' ', 'T'));
    }

    return new Date(normalized.replace(' ', 'T') + '-03:00');
  }

  private isExpired(expiresAt: Date): boolean {
    return Date.now() >= expiresAt.getTime() - 60 * 1000;
  }

  private async resolveValidAuthData(companyId: string) {
    const auth = await prisma.trayAuth.findUnique({
      where: { companyId },
    });

    if (!auth) {
      console.log('Nenhuma autenticacao Tray encontrada');
      return null;
    }

    const normalizedApiAddress = this.normalizeApiAddress(auth.apiAddress);
    if (!normalizedApiAddress) {
      console.log('api_address da Tray invalido ou ausente no banco');
      return null;
    }

    if (!this.isExpired(auth.expiresAt)) {
      const current = {
        accessToken: auth.accessToken,
        apiAddress: normalizedApiAddress,
        expiresAt: auth.expiresAt,
      };
      this.authCache.set(companyId, current);
      return current;
    }

    console.log('Token da Tray expirado, renovando...');

    if (!auth.refreshToken) {
      console.log('Sem refresh_token da Tray disponivel');
      return null;
    }

    const renewed = await this.refreshAccessToken(
      auth.refreshToken,
      normalizedApiAddress,
    );

    const renewedData = {
      accessToken: renewed.access_token,
      apiAddress: this.normalizeApiAddress(renewed.api_host || normalizedApiAddress),
      expiresAt: this.parseExpirationDate(
        renewed.date_expiration_access_token ||
          renewed.date_expiration_refresh_token ||
          renewed.date_expiration,
      ),
    };

    await this.saveAuth(companyId, {
      storeId: String(renewed.store_id || auth.storeId),
      apiAddress: renewedData.apiAddress,
      accessToken: renewedData.accessToken,
      refreshToken: renewed.refresh_token || auth.refreshToken,
      expiresAt: renewedData.expiresAt,
      storeName: auth.storeName || undefined,
    });

    return renewedData;
  }
}

export const trayAuthService = new TrayAuthService();
