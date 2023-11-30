import { callMirror } from "lworks-client";

import { createLogger } from "../../logger";
import { RawLoadedTransaction, TransactionsResponse } from "../types";
import { re } from "../existence-util";

import { loadEachTransactionById } from "./load-each-transaction-by-id";

const logger = createLogger("load-transactions-in-range");

export async function loadTransactions(account: string, dataStartTs: string, endTimestamp: string) {
  let next: string | undefined | null = `/api/v1/transactions?account.id=${account}&limit=25&order=asc&timestamp=gte:${dataStartTs}`;
  let loadedTransactions: RawLoadedTransaction[] = [];
  while (next) {
    logger.debug(`loading transaction: ${next}`);
    const response: TransactionsResponse = await callMirror<TransactionsResponse>(next);
    if (response.transactions) {
      // filter out duplicates that can happen when loading transactions from disk
      const lastKnownTransaction = loadedTransactions.at(-1);
      const newTransactions = lastKnownTransaction
        ? response.transactions.filter((t) => re(t.consensus_timestamp) > lastKnownTransaction.consensusTimestamp)
        : response.transactions;
      const endTransactionIndex = newTransactions.findIndex((t) => re(t.consensus_timestamp) > endTimestamp);
      if (endTransactionIndex !== -1) {
        const finalTransactions = newTransactions.slice(0, endTransactionIndex);
        logger.debug(`Adding final transactions. Count: ${finalTransactions.length}`);
        loadedTransactions = loadedTransactions.concat(await loadEachTransactionById(account, newTransactions.slice(0, endTransactionIndex)));
        break;
      }
      loadedTransactions = loadedTransactions.concat(await loadEachTransactionById(account, newTransactions));
    }
    next = response.links?.next;
  }
  return loadedTransactions;
}
