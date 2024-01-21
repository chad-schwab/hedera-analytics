import retry from "async-retry";
import Cache from "file-system-cache";

import { createLogger } from "../logger";

import { getNearestHourFromDate, getNearestHourFromUnixTimestamp } from "./get-nearest-hour";
// load token prices using this endpoint: https://api.saucerswap.finance/tokens/prices/usd/<tokenId>?from=<unix ts>&to=<unix ts>&interval=HOUR
// valid intervals
// * FIVEMIN
// * HOUR
// * DAY
// * WEEK

type CachedRate = {
  tokenId: string;
  date: Date | string;
  ratesByHour: Record<number, number>;
  avgRate: number;
};

const logger = createLogger("get-saucer-exchange-rate");

const rateCache = Cache({
  basePath: "./.cache",
  ns: "saucer-exchange-rates",
});

// q: write a function to convert a unix timestamp to the closest hour (floor) as a number from 0-23
// a: Math.floor(unixSeconds / 3600) % 24

const loadRate = async (tokenId: string, date: Date): Promise<CachedRate> => {
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
    (acc, rate) => {
      const { timestampSeconds, usdPrice } = rate;
      acc.ratesByHour[getNearestHourFromUnixTimestamp(timestampSeconds)] = usdPrice;
      acc.avgRate += usdPrice;

      return acc;
    },
    { tokenId, date: startOfDay, ratesByHour: {}, avgRate: 0 } as CachedRate
  );
  loadedRate.avgRate /= ratesResponse.length;
  rateCache.set(cacheKey, loadedRate);

  return loadedRate;
};

export async function getSaucerExchangeRate(tokenId: string, date: Date): Promise<number | null> {
  const cachedRate = await loadRate(tokenId, date);

  const hourlyRate = cachedRate.ratesByHour[getNearestHourFromDate(date)];
  if (hourlyRate === undefined) {
    const foundCount = Object.keys(cachedRate.ratesByHour).length;
    if (foundCount === 0) {
      logger.debug({ tokenId, date }, "No saucer swap exchange rate found.");
      return null;
    }
    logger.debug({ tokenId, date, foundCount }, "No hourly saucer swap exchange rate found. Using daily average.");

    return cachedRate.avgRate;
  }

  return hourlyRate;
}
