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

      const body = new URLSearchParams();
      body.set('consumer_key', this.consumerKey);
      body.set('consumer_secret', this.consumerSecret);
      body.set('code', code);

      const response = await axios.post(`${apiAddress}/auth`, body.toString(), {
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
    try {
      console.log('Renovando access_token da Tray...');

      const response = await axios.get(`${apiAddress}/auth`, {
        params: {
          refresh_token: refreshToken,
        },
      });

      console.log('Access token da Tray renovado com sucesso');
      return response.data;
    } catch (error: any) {
      console.error(
        'Erro ao renovar access_token da Tray:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Erro ao renovar token: ${error.response?.data?.message || error.message}`,
      );
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
    return await prisma.trayAuth.upsert({
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
  }

  async getValidAuth(storeId: string): Promise<string | null> {
    const auth = await prisma.trayAuth.findUnique({
      where: { storeId },
    });

    if (!auth) {
      console.log('Nenhuma autenticacao Tray encontrada');
      return null;
    }

    if (new Date() >= auth.expiresAt) {
      console.log('Token da Tray expirado, renovando...');

      if (!auth.refreshToken) {
        console.log('Sem refresh_token da Tray disponivel');
        return null;
      }

      const renewed = await this.refreshAccessToken(
        auth.refreshToken,
        auth.apiAddress,
      );

      await this.saveAuth(storeId, {
        apiAddress: renewed.api_host || auth.apiAddress,
        accessToken: renewed.access_token,
        refreshToken: renewed.refresh_token,
        expiresAt: this.parseExpirationDate(
          renewed.date_expiration_access_token ||
            renewed.date_expiration_refresh_token ||
            renewed.date_expiration,
        ),
      });

      return renewed.access_token;
    }

    return auth.accessToken;
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
    return new Date(dateStr.replace(' ', 'T'));
  }
}

export const trayAuthService = new TrayAuthService();
