import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export class TrayAuthService {
  private consumerKey: string;
  private consumerSecret: string;
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

  getAuthorizationUrl(storeUrl: string): string {
    const callbackUrl = encodeURIComponent(process.env.TRAY_CALLBACK_URL || '');
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

  async saveAuth(storeId: string, authData: {
    apiAddress: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    code?: string;
    storeName?: string;
  }) {
    const saved = await prisma.trayAuth.upsert({
      where: { storeId },
      create: {
        storeId,
        storeName: authData.storeName,
        apiAddress: authData.apiAddress,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        code: authData.code,
        expiresAt: authData.expiresAt,
      },
      update: {
        storeName: authData.storeName,
        apiAddress: authData.apiAddress,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        code: authData.code,
        expiresAt: authData.expiresAt,
      },
    });

    this.authCache.set(storeId, {
      accessToken: saved.accessToken,
      apiAddress: this.normalizeApiAddress(saved.apiAddress),
      expiresAt: saved.expiresAt,
    });

    return saved;
  }

  async getValidAuth(storeId: string): Promise<string | null> {
    const authData = await this.getValidAuthData(storeId);
    return authData?.accessToken || null;
  }

  async getValidAuthData(storeId: string) {
    const cached = this.authCache.get(storeId);
    if (cached && !this.isExpired(cached.expiresAt)) {
      return cached;
    }

    const pendingRefresh = this.refreshLocks.get(storeId);
    if (pendingRefresh) {
      return pendingRefresh;
    }

    const refreshPromise = this.resolveValidAuthData(storeId);
    this.refreshLocks.set(storeId, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.refreshLocks.delete(storeId);
    }
  }

  async getAuthData(storeId: string) {
    return await prisma.trayAuth.findUnique({
      where: { storeId },
    });
  }

  async getLatestAuth() {
    return await prisma.trayAuth.findFirst({
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async getCurrentAuth(storeId?: string) {
    if (storeId) {
      return this.getAuthData(storeId);
    }

    return this.getLatestAuth();
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

  private async resolveValidAuthData(storeId: string) {
    const auth = await prisma.trayAuth.findUnique({
      where: { storeId },
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
      this.authCache.set(storeId, current);
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

    await this.saveAuth(storeId, {
      apiAddress: renewedData.apiAddress,
      accessToken: renewedData.accessToken,
      refreshToken: renewed.refresh_token || auth.refreshToken,
      expiresAt: renewedData.expiresAt,
    });

    return renewedData;
  }
}

export const trayAuthService = new TrayAuthService();
