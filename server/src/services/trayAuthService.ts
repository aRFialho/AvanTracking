import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TrayAuthResponse {
  access_token: string;
  refresh_token?: string;
  date_expiration: string; // Formato: "2025-12-31 23:59:59"
  api_host: string;
}

export class TrayAuthService {
  private consumerKey: string;
  private consumerSecret: string;

  constructor() {
    this.consumerKey = process.env.TRAY_CONSUMER_KEY || '';
    this.consumerSecret = process.env.TRAY_CONSUMER_SECRET || '';
  }

  /**
   * Gerar URL de autorização para redirecionar o usuário
   */
  getAuthorizationUrl(storeUrl: string): string {
    const callbackUrl = encodeURIComponent(process.env.TRAY_CALLBACK_URL || '');
    return `${storeUrl}/auth.php?response_type=code&consumer_key=${this.consumerKey}&callback=${callbackUrl}`;
  }

  /**
   * Gerar chave de acesso (access_token) a partir do código
   */
  async generateAccessToken(code: string, apiAddress: string): Promise<TrayAuthResponse> {
    try {
      console.log('🔑 Gerando access_token...');

      const response = await axios.get(`${apiAddress}/auth`, {
        params: {
          consumer_key: this.consumerKey,
          consumer_secret: this.consumerSecret,
          code: code
        }
      });

      console.log('✅ Access token gerado com sucesso');
      return response.data;

    } catch (error: any) {
      console.error('❌ Erro ao gerar access_token:', error.response?.data || error.message);
      throw new Error(`Erro ao gerar token: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Renovar chave de acesso (refresh token)
   */
  async refreshAccessToken(refreshToken: string, apiAddress: string): Promise<TrayAuthResponse> {
    try {
      console.log('🔄 Renovando access_token...');

      const response = await axios.get(`${apiAddress}/auth`, {
        params: {
          consumer_key: this.consumerKey,
          consumer_secret: this.consumerSecret,
          refresh_token: refreshToken
        }
      });

      console.log('✅ Access token renovado com sucesso');
      return response.data;

    } catch (error: any) {
      console.error('❌ Erro ao renovar access_token:', error.response?.data || error.message);
      throw new Error(`Erro ao renovar token: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Salvar ou atualizar autenticação no banco
   */
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
        expiresAt: authData.expiresAt
      },
      update: {
        apiAddress: authData.apiAddress,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
        expiresAt: authData.expiresAt
      }
    });
  }

  /**
   * Buscar autenticação válida do banco
   */
  async getValidAuth(storeId: string): Promise<string | null> {
    const auth = await prisma.trayAuth.findUnique({
      where: { storeId }
    });

    if (!auth) {
      console.log('⚠️ Nenhuma autenticação encontrada');
      return null;
    }

    // Verificar se expirou
    if (new Date() >= auth.expiresAt) {
      console.log('⏰ Token expirado, renovando...');
      
      if (!auth.refreshToken) {
        console.log('❌ Sem refresh_token disponível');
        return null;
      }

      // Renovar token
      const renewed = await this.refreshAccessToken(auth.refreshToken, auth.apiAddress);
      
      // Salvar novo token
      await this.saveAuth(storeId, {
        apiAddress: auth.apiAddress,
        accessToken: renewed.access_token,
        refreshToken: renewed.refresh_token,
        expiresAt: new Date(renewed.date_expiration)
      });

      return renewed.access_token;
    }

    return auth.accessToken;
  }
/**
 * Buscar dados de autenticação completos
 */
async getAuthData(storeId: string) {
  return await prisma.trayAuth.findUnique({
    where: { storeId }
  });
}
  /**
   * Converter data de expiração da Tray para Date
   */
  parseExpirationDate(dateStr: string): Date {
    // Formato: "2025-12-31 23:59:59"
    return new Date(dateStr.replace(' ', 'T'));
  }
}

export const trayAuthService = new TrayAuthService();