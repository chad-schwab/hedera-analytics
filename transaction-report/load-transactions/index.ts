import { createLogger } from "../../logger";
import { RawLoadedTransaction } from "../types";
import { re } from "../existence-util";
import { dateToHederaTs } from "../hedera-utils";

import { PartialTransactionsLoadedError, loadTransactionsFromMirror } from "./load-transactions-from-mirror";
import { getCachedTransactions, setCachedTransactions } from "./transaction-cache";

export const logger = createLogger("load-transactions");

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
  const archivedTransactions = await getCachedTransactions(account);

  let transactions = archivedTransactions || [];
  try {
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
  } catch (err) {
    if (err instanceof PartialTransactionsLoadedError) {
      logger.info("Error loading all transactions. Updating transaction cache with partially loaded transactions before exit.");
      await setCachedTransactions(account, [...transactions, ...err.loadedTransactions]);
    }
    throw err;
  }

  if (transactions.length !== archivedTransactions?.length) {
    await setCachedTransactions(account, transactions);
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
