/**
 * Rate Limiter para API Tray
 * Limite: 180 requisições por minuto
 */
export class RateLimiter {
  private requests: number[] = []; // Timestamps das requisições
  private maxRequests: number;
  private timeWindow: number; // em milissegundos

  constructor(maxRequests: number = 180, timeWindowMinutes: number = 1) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMinutes * 60 * 1000; // Converter para ms
  }

  /**
   * Limpar requisições antigas (fora da janela de tempo)
   */
  private cleanOldRequests(): void {
    const now = Date.now();
    const cutoff = now - this.timeWindow;
    
    // Remover requisições mais antigas que 1 minuto
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
  }

  /**
   * Verificar se pode fazer requisição
   */
  canMakeRequest(): boolean {
    this.cleanOldRequests();
    return this.requests.length < this.maxRequests;
  }

  /**
   * Obter número de requisições restantes
   */
  getRemainingRequests(): number {
    this.cleanOldRequests();
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  /**
   * Obter tempo de espera necessário (em ms)
   */
  getWaitTime(): number {
    this.cleanOldRequests();
    
    if (this.canMakeRequest()) {
      return 0;
    }

    // Calcular quando a requisição mais antiga sairá da janela
    const oldestRequest = this.requests[0];
    const timeUntilExpire = (oldestRequest + this.timeWindow) - Date.now();
    
    return Math.max(0, timeUntilExpire);
  }

  /**
   * Aguardar até poder fazer requisição
   */
  async waitIfNeeded(): Promise<void> {
    const waitTime = this.getWaitTime();
    
    if (waitTime > 0) {
      const seconds = (waitTime / 1000).toFixed(1);
      console.log(`⏳ Rate limit atingido. Aguardando ${seconds}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime + 100)); // +100ms de margem
    }
  }

  /**
   * Registrar uma requisição
   */
  recordRequest(): void {
    this.cleanOldRequests();
    this.requests.push(Date.now());
    
    const remaining = this.getRemainingRequests();
    
    if (remaining < 20) {
      console.log(`⚠️  Rate limit: ${remaining} requisições restantes`);
    }
  }

  /**
   * Executar uma função respeitando o rate limit
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitIfNeeded();
    this.recordRequest();
    return await fn();
  }

  /**
   * Obter estatísticas
   */
  getStats(): {
    requestsInWindow: number;
    remaining: number;
    maxRequests: number;
    utilizationPercent: number;
  } {
    this.cleanOldRequests();
    const requestsInWindow = this.requests.length;
    const remaining = this.getRemainingRequests();
    const utilizationPercent = (requestsInWindow / this.maxRequests) * 100;

    return {
      requestsInWindow,
      remaining,
      maxRequests: this.maxRequests,
      utilizationPercent: Math.round(utilizationPercent * 10) / 10
    };
  }

  /**
   * Resetar contador (usar com cuidado)
   */
  reset(): void {
    this.requests = [];
    console.log('🔄 Rate limiter resetado');
  }
}

// Instância global para Tray API
export const trayRateLimiter = new RateLimiter(180, 1);