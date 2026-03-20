/**
 * Utilitário para fazer requisições HTTP com autenticação JWT
 */

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
};

/**
 * Wrapper para fetch com autenticação que já da parse no JSON
 */
export const apiRequest = async <T = any>(
  url: string,
  options: RequestInit = {}
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
