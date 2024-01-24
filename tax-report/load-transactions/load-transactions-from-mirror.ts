import { callMirror } from "lworks-client";

import { RawLoadedTransaction, TransactionsResponse } from "../types";
import { re } from "../existence-util";
import { createLogger } from "../../logger";

import { loadEachTransactionById } from "./load-each-transaction-by-id";

const logger = createLogger("load-transactions-from-mirror");

export class PartialTransactionsLoadedError extends Error {
  constructor(public readonly loadedTransactions: RawLoadedTransaction[]) {
    super("Partial transactions loaded");
  }
}

type LoadFromMirrorOptions = Partial<{
  startTsExclusive: boolean;
  endTsExclusive: boolean;
}>;

function trimTransactions(
  loadedTransactions: RawLoadedTransaction[],
  startTsExclusive: boolean | undefined,
  startConsensusTs: string,
  endTsExclusive: boolean | undefined,
  endConsensusTs: string
) {
  if (startTsExclusive && loadedTransactions.at(0)?.consensusTimestamp === startConsensusTs) {
    loadedTransactions.shift();
  }
  if (endTsExclusive && loadedTransactions.at(-1)?.consensusTimestamp === endConsensusTs) {
    loadedTransactions.pop();
  }
}

/**
 * Loads transactions for a specific account within a given time range.
 * This will paginate on the transactions endpoint.
 * For each transaction, it also makes a call to the transactions/<id> endpoint in order to load NFT transfers.
 * @param account - The account ID.
 * @param startConsensusTs - The start timestamp for the data range.
 * @param endConsensusTs - The end timestamp for the data range.
 * @returns A promise that resolves to an array of loaded transactions.
 */
export async function loadTransactionsFromMirror(
  account: string,
  startConsensusTs: string,
  endConsensusTs: string,
  { startTsExclusive, endTsExclusive }: LoadFromMirrorOptions = {}
) {
  let next: string | undefined | null = `/api/v1/transactions?account.id=${account}&limit=25&order=asc&timestamp=gte:${startConsensusTs}`;
  let loadedTransactions: RawLoadedTransaction[] = [];
  try {
    while (next) {
      logger.debug(`loading transaction: ${next}`);
      const { transactions, links }: TransactionsResponse = await callMirror<TransactionsResponse>(next);
      if (transactions) {
        const endTransactionIndex = transactions.findIndex((t) => re(t.consensus_timestamp) > endConsensusTs);
        if (endTransactionIndex !== -1) {
          const finalTransactions = transactions.slice(0, endTransactionIndex);
          logger.debug(`Adding final transactions. Count: ${finalTransactions.length}`);
          loadedTransactions = loadedTransactions.concat(await loadEachTransactionById(account, transactions.slice(0, endTransactionIndex)));
          break;
        }
        loadedTransactions = loadedTransactions.concat(await loadEachTransactionById(account, transactions));
      }
      next = links?.next;
    }
  } catch (err) {
    logger.error({ err }, "Failed to load transactions from mirror");
    trimTransactions(loadedTransactions, startTsExclusive, startConsensusTs, endTsExclusive, endConsensusTs);
    if (loadedTransactions.length > 0) {
      throw new PartialTransactionsLoadedError(loadedTransactions);
    }
    throw err;
  }

  trimTransactions(loadedTransactions, startTsExclusive, startConsensusTs, endTsExclusive, endConsensusTs);
  return loadedTransactions;
}
