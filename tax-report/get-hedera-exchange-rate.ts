import { callMirror } from "lworks-client";
import Cache from "file-system-cache";
import retry from "async-retry";

import { createLogger } from "../logger";

import { dateToHederaTs } from "./hedera-utils";
import { ExchangeRate, ExchangeRateResponse } from "./types";
import { re } from "./existence-util";

const exchangeRateCache = Cache({
  basePath: "./.cache", // (optional) Path where cache files are stored (default).
  ns: "hbar-exchange-rate", // (optional) A grouping namespace for items.
});

const logger = createLogger("get-hedera-exchange-rate");

function getNearestMinute(date: Date) {
  return Math.floor(date.getTime() / 60000);
}
function getRate(er: ExchangeRate) {
  return 0.01 * (re(er.cent_equivalent) / re(er.hbar_equivalent));
}

async function getCachedRate(nearestMinute: number, rateField: "current_rate" | "next_rate") {
  const cachedRate: ExchangeRateResponse = await retry(() => exchangeRateCache.get(`${nearestMinute}`, null), {
    retries: 3,
    onRetry: (err) => {
      logger.debug({ err }, "Failed to get exchange rate from cache, retrying");
    },
  });
  const exchangeRate = cachedRate?.[rateField];
  if (exchangeRate) {
    return getRate(exchangeRate);
  }

  return null;
}

async function loadExchangeRate(nearestMinute: number, date: Date) {
  logger.debug({ nearestMinute }, "Loading current exchange rate");
  const loadedRate = await callMirror<ExchangeRateResponse>(`/api/v1/network/exchangerate?timestamp=${dateToHederaTs(date, false)}`);

  exchangeRateCache.set(`${nearestMinute}`, loadedRate);

  return loadedRate;
}

async function checkCache(nearestMinute: number) {
  const currentRate = await getCachedRate(nearestMinute, "current_rate");
  if (currentRate) {
    logger.debug({ nearestMinute }, "Using cached current rate");
    return currentRate;
  }
  const nearestPreviousMinute = nearestMinute - 60;
  const previousNextRate = await getCachedRate(nearestPreviousMinute, "next_rate");
  if (previousNextRate) {
    logger.debug({ previousNextRate }, "Using cached previous next rate");
    return previousNextRate;
  }

  return null;
}

export async function getHederaExchangeRate(date: Date): Promise<number> {
  const nearestMinute = getNearestMinute(date);
  const exchangeRate = await checkCache(nearestMinute);
  if (exchangeRate) {
    return exchangeRate;
  }
  const loadedRate = await loadExchangeRate(nearestMinute, date);
  if (!loadedRate.current_rate) {
    throw new Error(`Failed to load exchange rate for ${date}`);
  }

  return getRate(loadedRate.current_rate);
}
