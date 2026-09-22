let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export async function getUsdExchangeRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && now - cachedRate.timestamp < CACHE_TTL_MS) {
    return cachedRate.rate;
  }

  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/blue', {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data.venta) || Number(data.promedio);
      if (rate > 0) {
        cachedRate = { rate, timestamp: now };
        return rate;
      }
    }
  } catch (err) {
    console.error('Error fetching exchange rate from DolarApi:', err);
  }

  // Fallback if API fails or offline
  const fallback = cachedRate?.rate;
  console.warn(
    `[currency] DolarApi no respondió — usando ${fallback ? 'cache vencida' : 'fallback hardcodeado (1200)'}.`
  );
  return fallback || 1200;
}

export async function normalizeToArs(amount: number, currency: 'ARS' | 'USD'): Promise<{ amountArs: number; exchangeRate: number | null }> {
  if (currency === 'USD') {
    const rate = await getUsdExchangeRate();
    return {
      amountArs: Math.round(amount * rate * 100) / 100,
      exchangeRate: rate,
    };
  }
  return {
    amountArs: amount,
    exchangeRate: null,
  };
}
