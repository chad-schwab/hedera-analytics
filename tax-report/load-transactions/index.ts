import zlib from "node:zlib";

import Cache from "file-system-cache";

import { createLogger } from "../../logger";
import { RawLoadedTransaction } from "../types";
import { re } from "../existence-util";
import { dateToHederaTs } from "../hedera-utils";

import { loadTransactionsFromMirror } from "./load-transactions-from-mirror";

const logger = createLogger("load-transactions");

const fileCache = Cache({
  basePath: "./.cache",
  ns: "account-transaction-archive",
});

const currentArchiveVersion = 2;

export type ArchiveData = {
  transactions: RawLoadedTransaction[];
  version: number;
};

async function getCachedArchive(account: string) {
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
  }

  return archiveData;
}
async function setArchiveData(account: string, transactions: RawLoadedTransaction[]) {
  logger.debug({ account, transactionsLoaded: transactions.length }, "Saving new transactions to cache");
  const transactionsArchive = zlib.gzipSync(JSON.stringify({ transactions, version: currentArchiveVersion })).toString("base64");

  await fileCache.set(account, transactionsArchive);
}
function sanitizeDeserializedTransaction(value: RawLoadedTransaction): RawLoadedTransaction {
  value.timestamp = new Date(value.timestamp);
  return value;
}

/**
 * Loads transactions for a specific account within a given time range. Results are cached to allow speedy subsequent loads.
 *
 * @param account - The account for which to load transactions.
 * @param dataStartDate - The start Date.
 * @param dataEndDate - The end Date.
 * @returns The loaded transactions.
 */
export async function loadAccountTransactions(account: string, dataStartDate: Date, dataEndDate: Date): Promise<RawLoadedTransaction[]> {
  const consensusStartTs = dateToHederaTs(dataStartDate, false);
  const consensusEndTs = dateToHederaTs(dataEndDate, true);
  const archivedData = await getCachedArchive(account);

  let transactions = archivedData?.transactions.map(sanitizeDeserializedTransaction) || [];
  if (transactions.length === 0) {
    transactions = await loadTransactionsFromMirror(account, consensusStartTs, consensusEndTs);
  } else {
    const archiveStartTs = transactions[0].consensusTimestamp;
    const archiveEndTs = re(transactions.at(-1))?.consensusTimestamp;
    if (archiveStartTs > consensusStartTs) {
      logger.debug({ account, startTs: consensusStartTs, endTs: archiveStartTs }, "Loading potential missing head transactions from mirror");
      transactions = [...(await loadTransactionsFromMirror(account, consensusStartTs, archiveStartTs, { endTsExclusive: true })), ...transactions];
    }
    if (archiveEndTs < consensusEndTs) {
      logger.debug({ account, startTs: archiveEndTs, endTs: consensusEndTs }, "Loading potential missing tail transactions from mirror");
      transactions = [...transactions, ...(await loadTransactionsFromMirror(account, archiveEndTs, consensusEndTs, { startTsExclusive: true }))];
    }
  }

  if (transactions.length !== archivedData?.transactions.length) {
    await setArchiveData(account, transactions);
  }

  return transactions;
}

/**
 * Loads transactions for multiple accounts within a specified date range. Results are cached per account to allow speedy subsequent loads.
 * @param accounts - An array of account IDs.
 * @param dataStartDate - The start Date.
 * @param dataEndDate - The end Date.
 * @returns A promise that resolves to an object containing the loaded transactions for each account.
 */
export async function loadAccountsTransactions(accounts: string[], dataStartDate: Date, dateEndDate: Date) {
  // load transactions for each account serially to avoid rate limiting
  return accounts.reduce(
    async (agg, account) => ({
      ...(await agg),
      [account]: await loadAccountTransactions(account, dataStartDate, dateEndDate),
    }),
    Promise.resolve({} as { [account: string]: RawLoadedTransaction[] })
  );
}
