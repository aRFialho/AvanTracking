import { Request, Response } from 'express';
import { trayAuthService } from '../services/trayAuthService';

/**
 * GET /api/tray/callback
 * Landing Page de instalação do app
 */
export const showInstallPage = (req: Request, res: Response) => {
  const { url, adm_user, store } = req.query;

  console.log('📦 Callback recebido:', { url, adm_user, store });

  // Renderizar HTML de instalação
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Instalar Integração Tray</title>
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
        <h1>🚀 Integração de Pedidos</h1>
        <p>Conecte sua loja Tray com nosso sistema de rastreamento de pedidos.</p>
        <p><strong>Loja:</strong> ${url}</p>
        <p><strong>Usuário:</strong> ${adm_user}</p>
        <button onclick="authorize()">Autorizar Agora</button>
      </div>
      <script>
        function authorize() {
          const storeUrl = '${url}';
          const callbackUrl = encodeURIComponent('${process.env.TRAY_CALLBACK_URL}/auth');
          const consumerKey = '${process.env.TRAY_CONSUMER_KEY}';
          
          window.location.href = storeUrl + '/auth.php?response_type=code&consumer_key=' + consumerKey + '&callback=' + callbackUrl;
        }
      </script>
    </body>
    </html>
  `;

  res.send(html);
};

/**
 * GET /api/tray/callback/auth
 * Receber código de autorização e gerar token
 */
export const handleAuthCallback = async (req: Request, res: Response) => {
  try {
    const { code, api_address, store, store_host, adm_user } = req.query;

    console.log('🔐 Callback de autorização:', { code, api_address, store, store_host, adm_user });

    if (!code || !api_address || !store) {
      return res.status(400).json({ error: 'Parâmetros faltando' });
    }

        // 1. Gerar access_token
    const authData = await trayAuthService.generateAccessToken(
      String(code),
      String(api_address)
    );

    // Pegamos o nome correto do campo que a Tray envia (usando 'as any' para o TypeScript não reclamar)
    const expirationDate = (authData as any).date_expiration_access_token || (authData as any).date_expiration_refresh_token;

    // 2. Salvar no banco
    await trayAuthService.saveAuth(String(store), {
      apiAddress: String(api_address),
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      expiresAt: trayAuthService.parseExpirationDate(expirationDate), // <-- CORRIGIDO AQUI
      code: String(code),
      storeName: String(store_host)
    });

    console.log('✅ Autenticação salva com sucesso');

    // 3. Renderizar página de sucesso
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Autorização Concluída</title>
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✓</div>
          <h1>Autorização Concluída!</h1>
          <p>Sua loja foi conectada com sucesso.</p>
          <p>Você já pode sincronizar seus pedidos.</p>
        </div>
      </body>
      </html>
    `;

    res.send(html);

  } catch (error) {
    console.error('❌ Erro no callback:', error);
    res.status(500).json({ 
      error: 'Erro ao processar autorização',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

/**
 * GET /api/tray/status
 * Verificar status da autenticação
 */
export const checkAuthStatus = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ error: 'storeId é obrigatório' });
    }

    const token = await trayAuthService.getValidAuth(String(storeId));

    if (!token) {
      return res.json({
        authorized: false,
        message: 'Loja não autorizada ou token expirado'
      });
    }

    return res.json({
      authorized: true,
      message: 'Loja autorizada e token válido'
    });

  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};