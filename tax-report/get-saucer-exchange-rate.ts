import retry from "async-retry";
import Cache from "file-system-cache";

import { createLogger } from "../logger";
// load token prices using this endpoint: https://api.saucerswap.finance/tokens/prices/usd/<tokenId>?from=<unix ts>&to=<unix ts>&interval=HOUR
// valid intervals
// * FIVEMIN
// * HOUR
// * DAY
// * WEEK

type CachedRate = {
  tokenId: string;
  date: Date;
  min: number;
  max: number;
  avg: number;
};

const logger = createLogger("get-saucer-exchange-rate");

const rateCache = Cache({
  basePath: "./.cache",
  ns: "saucer-exchange-rate",
});

export const getSaucerExchangeRate = async (tokenId: string, date: Date): Promise<CachedRate> => {
  const startOfDay = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const cacheKey = `${tokenId}-${startOfDay.toISOString()}`;
  const cachedRate: CachedRate = await rateCache.get(cacheKey, null);
  if (cachedRate) {
    logger.debug({ cachedRate }, "Using cached rate");
    return cachedRate;
  }

  const startDayUnix = startOfDay.getTime() / 1000;
  const endDayUnix = startDayUnix + 86400 - 1;

  const ratesResponse: { usdPrice: number; timestampSeconds: number }[] = await retry(
    async () => {
      const response = await fetch(`https://api.saucerswap.finance/tokens/prices/usd/${tokenId}?from=${startDayUnix}&to=${endDayUnix}&interval=HOUR`);
      if (!response.ok) {
        throw new Error(`Failed to load exchange rate for ${tokenId} on ${startOfDay}`);
      }
      if (response.status === 404) {
        logger.warn({ tokenId, startOfDay }, `No saucer swap exchange rate found, ${response.status}`);
        return [];
      }
      return response.json();
    },
    { retries: 5, minTimeout: 500, onRetry: (err) => logger.warn({ err }, "Failed to load saucer exchange rate, retrying") }
  );

  const loadedRate = ratesResponse.reduce(
    (acc, rate, i) => {
      const usdPrice = Number(rate.usdPrice);
      if (usdPrice < acc.min) {
        acc.min = usdPrice;
      }
      if (usdPrice > acc.max) {
        acc.max = usdPrice;
      }
      acc.avg += usdPrice;
      if (i === ratesResponse.length - 1) {
        acc.avg /= ratesResponse.length;
      }
      return acc;
    },
    { tokenId, date: startOfDay, min: Infinity, max: 0, avg: 0 } satisfies CachedRate
  );

  rateCache.set(cacheKey, loadedRate);

  return loadedRate;
};
