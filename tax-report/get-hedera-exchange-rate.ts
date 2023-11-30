import { callMirror } from "lworks-client";

import { createLogger } from "../logger";

import { dateToHederaTs } from "./hedera-utils";
import { ExchangeRate, ExchangeRateResponse } from "./types";
import { re } from "./existence-util";

const logger = createLogger("get-hedera-exchange-rate");

function getNearestMinute(date: Date) {
  return Math.floor(date.getTime() / 60000);
}
function getRate(er: ExchangeRate) {
  return 0.01 * (re(er.cent_equivalent) / re(er.hbar_equivalent));
}
const exchangeRateCache = new Map<number, Promise<ExchangeRateResponse>>();

async function getCachedExchangeRate(nearestMinute: number, rateField: "current_rate" | "next_rate") {
  const cachedRate = exchangeRateCache.get(nearestMinute);
  if (cachedRate) {
    try {
      const exchangeRates = await cachedRate;
      const exchangeRate = exchangeRates[rateField];
      if (exchangeRate) {
        return getRate(exchangeRate);
      }
      logger.warn({ rateField, nearestMinute }, "Desired field not present in exchange rate");
    } catch (e) {
      logger.warn({ error: (e as Error)?.message, nearestMinute }, "Failed loading exchange rate");
      exchangeRateCache.delete(nearestMinute);
    }
  }

  return null;
}

export async function getHederaExchangeRate(date: Date, recursed = false) {
  const nearestMinute = getNearestMinute(date);
  const nearestPreviousMinute = nearestMinute - 60;
  const currentRate = await getCachedExchangeRate(nearestMinute, "current_rate");
  if (currentRate) {
    logger.debug({ nearestMinute }, "Using current rate");
    return currentRate;
  }
  const previousNextRate = await getCachedExchangeRate(nearestPreviousMinute, "next_rate");
  if (previousNextRate) {
    logger.debug({ previousNextRate }, "Using previous next rate");
    return previousNextRate;
  }

  if (recursed) {
    throw new Error(`Failed to load exchange rate for ${date}`);
  }

  logger.debug({ previousNextRate }, "Loading current exchange rate");
  exchangeRateCache.set(nearestMinute, callMirror<ExchangeRateResponse>(`/api/v1/network/exchangerate?timestamp=${dateToHederaTs(date, false)}`));
  return getHederaExchangeRate(date, true);
}
