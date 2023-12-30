import Cache from "file-system-cache";

import { createLogger } from "../../logger";
import { RawLoadedTransaction } from "../types";
import { re } from "../existence-util";

import { loadTransactionsFromMirror } from "./load-transactions-from-mirror";

const logger = createLogger("load-transactions");

const fileCache = Cache({
  basePath: "./.cache",
  ns: "account-transaction-archive",
});

const currentArchiveVersion = 1;

export type ArchiveData = {
  transactions: RawLoadedTransaction[];
  version: number;
};

async function getCachedArchive(account: string) {
  const archivedData: ArchiveData | null = await fileCache.get(account, null);
  if (!archivedData) {
    logger.debug({ account, currentArchiveVersion }, `No valid archived data found for account ${account}`);
  } else if (archivedData.version !== currentArchiveVersion) {
    logger.debug(
      { account, archivedDataVersion: archivedData?.version, currentArchiveVersion },
      `No valid archived data found for account ${account}`
    );
  }
  return archivedData;
}

export async function loadTransactions(account: string, consensusStartTs: string, consensusEndTs: string) {
  const archivedData = await getCachedArchive(account);

  let transactions = archivedData?.transactions || [];
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
    logger.debug({ account, transactionsLoaded: transactions.length }, "Saving new transactions to cache");
    await fileCache.set(account, { transactions, version: currentArchiveVersion });
  }

  return transactions;
}
