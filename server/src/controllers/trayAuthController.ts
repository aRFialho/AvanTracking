import { Request, Response } from 'express';
import { trayAuthService } from '../services/trayAuthService';

export const startTrayAuthorization = (req: Request, res: Response) => {
  const { url } = req.query;

  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem iniciar a integracao Tray' });
  }

  if (!url) {
    return res.status(400).json({ error: 'A URL da loja Tray e obrigatoria' });
  }

  try {
    const authUrl = trayAuthService.getAuthorizationUrl(String(url));
    return res.json({ authUrl });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao iniciar autorizacao da Tray',
    });
  }
};

/**
 * GET /api/tray/callback
 * Landing page opcional de instalacao
 */
export const showInstallPage = (req: Request, res: Response) => {
  const { url, adm_user, store } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'A URL da loja Tray e obrigatoria' });
  }

  const normalizedStoreUrl = trayAuthService.normalizeStoreUrl(String(url));
  const authUrl = trayAuthService.getAuthorizationUrl(normalizedStoreUrl);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Instalar Integracao Tray</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 520px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
        }
        h1 {
          color: #333;
          margin-bottom: 20px;
        }
        p {
          color: #666;
          line-height: 1.6;
        }
        button {
          background: #667eea;
          color: white;
          border: none;
          padding: 15px 40px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 20px;
          transition: all 0.3s;
        }
        button:hover {
          background: #5568d3;
          transform: translateY(-2px);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Integracao de Pedidos Tray</h1>
        <p>Conecte sua loja Tray com o sistema para sincronizar pedidos.</p>
        <p><strong>Loja:</strong> ${normalizedStoreUrl}</p>
        ${store ? `<p><strong>Store:</strong> ${store}</p>` : ''}
        ${adm_user ? `<p><strong>Usuario:</strong> ${adm_user}</p>` : ''}
        <button onclick="authorize()">Autorizar agora</button>
      </div>
      <script>
        function authorize() {
          window.location.href = ${JSON.stringify(authUrl)};
        }
      </script>
    </body>
    </html>
  `;

  res.send(html);
};

/**
 * GET /api/tray/callback/auth
 * Receber codigo de autorizacao e gerar token
 */
export const handleAuthCallback = async (req: Request, res: Response) => {
  try {
    const { code, api_address, store, store_host, adm_user } = req.query;

    console.log('Callback de autorizacao Tray:', {
      code,
      api_address,
      store,
      store_host,
      adm_user,
    });

    if (!code || !api_address || !store) {
      return res.status(400).json({ error: 'Parametros faltando' });
    }

    const authData = await trayAuthService.generateAccessToken(
      String(code),
      String(api_address),
    );

    const expirationDate =
      (authData as any).date_expiration_access_token ||
      (authData as any).date_expiration_refresh_token ||
      authData.date_expiration;

    await trayAuthService.saveAuth(String(store), {
      apiAddress: String(api_address),
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      expiresAt: trayAuthService.parseExpirationDate(expirationDate),
      code: String(code),
      storeName: String(store_host || ''),
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Autorizacao Concluida</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
          }
          h1 {
            color: #10b981;
          }
          .checkmark {
            font-size: 64px;
            color: #10b981;
          }
          .meta {
            margin-top: 16px;
            color: #64748b;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✓</div>
          <h1>Autorizacao concluida</h1>
          <p>Sua loja Tray foi conectada com sucesso.</p>
          <p>Voce ja pode sincronizar os pedidos.</p>
          <div class="meta">
            <div><strong>Store:</strong> ${String(store)}</div>
            ${store_host ? `<div><strong>Host:</strong> ${String(store_host)}</div>` : ''}
            ${adm_user ? `<div><strong>Usuario:</strong> ${String(adm_user)}</div>` : ''}
          </div>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Erro no callback da Tray:', error);
    res.status(500).json({
      error: 'Erro ao processar autorizacao',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * GET /api/tray/status
 * Verificar status da autenticacao
 */
export const checkAuthStatus = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ error: 'storeId e obrigatorio' });
    }

    const token = await trayAuthService.getValidAuth(String(storeId));

    if (!token) {
      return res.json({
        authorized: false,
        message: 'Loja nao autorizada ou token expirado',
      });
    }

    return res.json({
      authorized: true,
      message: 'Loja autorizada e token valido',
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};
