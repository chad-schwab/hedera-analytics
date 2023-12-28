import { createLogger } from "../../logger";
import { RawLoadedTransaction } from "../types";

import { removeZeroedNftTransfers } from "./remove-zeroed-nft-transfers";
import { removeZeroedTokenTransfers } from "./remove-zeroed-token-transfers";

const logger = createLogger("merge-transactions-by-transaction-id");

/**
 *  combines transactions with the same transaction id, e.g. contract calls and merged account transactions
 *  this function mutates the underlying transactions for performance
 */
export function mergeTransactionsByTransactionId(loadedTransactions: RawLoadedTransaction[]): RawLoadedTransaction[] {
  const aggregatedTransactions: RawLoadedTransaction[] = [];
  let runningAggregate: RawLoadedTransaction | null = null;
  loadedTransactions.forEach((t) => {
    if (!runningAggregate) {
      runningAggregate = t;
      return;
    }

    const currentAggregate = runningAggregate;

    if (currentAggregate.transactionId !== t.transactionId) {
      aggregatedTransactions.push(currentAggregate);
      runningAggregate = t;
      return;
    }

    logger.debug(`dealing with duplicated transaction id: ${currentAggregate.transactionId}`);
    currentAggregate._aggregated = true;
    currentAggregate.hbarFromAccount = [
      ...currentAggregate.hbarFromAccount,
      ...t.hbarFromAccount.filter((a) => !currentAggregate.hbarFromAccount.includes(a)),
    ];
    currentAggregate.hbarToAccount = [
      ...currentAggregate.hbarToAccount,
      ...t.hbarToAccount.filter((a) => !currentAggregate.hbarToAccount.includes(a)),
    ];
    currentAggregate.hbarTransfer += t.hbarTransfer;
    currentAggregate.stakingReward += t.stakingReward;
    currentAggregate.nftTransfers = removeZeroedNftTransfers([...currentAggregate.nftTransfers, ...t.nftTransfers]);
    currentAggregate.tokenTransfers = removeZeroedTokenTransfers([...currentAggregate.tokenTransfers, ...t.tokenTransfers]);
    currentAggregate.memo = currentAggregate.memo === t.memo ? currentAggregate.memo : [currentAggregate.memo, t.memo].filter((m) => m).join(", ");
  });

  if (runningAggregate) {
    aggregatedTransactions.push(runningAggregate);
  }

  return aggregatedTransactions;
}
