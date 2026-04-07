/**
 * Utilitario para fazer requisicoes HTTP com autenticacao JWT
 */

let authExpiredEventDispatched = false;

const clearStoredSession = () => {
  localStorage.removeItem('session_user');
  localStorage.removeItem('session_token');
  sessionStorage.removeItem('session_user');
  sessionStorage.removeItem('session_token');
};

const notifyExpiredSession = () => {
  clearStoredSession();

  if (authExpiredEventDispatched) {
    return;
  }

  authExpiredEventDispatched = true;
  window.dispatchEvent(new CustomEvent('auth:expired'));
};

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token =
    localStorage.getItem('session_token') ||
    sessionStorage.getItem('session_token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as any).Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    const clonedResponse = response.clone();

    clonedResponse
      .json()
      .then((data) => {
        if (data?.code === 'TOKEN_EXPIRED' || data?.code === 'TOKEN_INVALID') {
          notifyExpiredSession();
        }
      })
      .catch(() => {
        if (response.status === 401) {
          notifyExpiredSession();
        }
      });
  } else if (authExpiredEventDispatched) {
    authExpiredEventDispatched = false;
  }

  return response;
};

/**
 * Wrapper para fetch com autenticacao que ja da parse no JSON
 */
export const apiRequest = async <T = any>(
  url: string,
  options: RequestInit = {},
): Promise<{ data?: T; error?: string; status: number }> => {
  try {
    const response = await fetchWithAuth(url, options);
    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.error || `HTTP ${response.status}`,
        status: response.status,
      };
    }

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 0,
    };
  }
};
