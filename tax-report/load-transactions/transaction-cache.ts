import zlib from "node:zlib";

import Cache from "file-system-cache";

import { RawLoadedTransaction } from "../types";
import { createLogger } from "../../logger";

const logger = createLogger("transaction-cache");

export const fileCache = Cache({
  basePath: "./.cache",
  ns: "account-transaction-archive",
});
export const currentArchiveVersion = 2;

export type ArchiveData = {
  transactions: RawLoadedTransaction[];
  version: number;
};
function sanitizeDeserializedTransaction(value: RawLoadedTransaction): RawLoadedTransaction {
  value.timestamp = new Date(value.timestamp);
  return value;
}

export async function getCachedTransactions(account: string) {
  const gZippedArchiveData = await fileCache.get(account, null);
  if (!gZippedArchiveData) {
    logger.debug({ account, currentArchiveVersion }, `No valid archived data found for account ${account}`);
    return null;
  }
  if (typeof gZippedArchiveData !== "string") {
    logger.debug({ account, archiveType: typeof gZippedArchiveData }, `Unknown format for archive data for: ${account}`);
    return null;
  }

  let archiveData: ArchiveData;
  try {
    archiveData = JSON.parse(zlib.gunzipSync(Buffer.from(gZippedArchiveData, "base64")).toString());
  } catch (e) {
    logger.warn(e, "Failed to decompress archived data");
    return null;
  }
  if (archiveData.version !== currentArchiveVersion) {
    logger.debug(
      { account, archivedDataVersion: archiveData?.version, currentArchiveVersion },
      `No valid archived data found for account ${account}`
    );
    return null;
  }

  return archiveData.transactions.map(sanitizeDeserializedTransaction);
}
export async function setCachedTransactions(account: string, transactions: RawLoadedTransaction[]) {
  logger.debug({ account, transactionsLoaded: transactions.length }, "Saving new transactions to cache");
  const transactionsArchive = zlib.gzipSync(JSON.stringify({ transactions, version: currentArchiveVersion })).toString("base64");

  await fileCache.set(account, transactionsArchive);
}
