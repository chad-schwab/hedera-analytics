import { createLogger } from "../../logger";
import { RawLoadedTransaction } from "../types";

import { removeMultiHopTokenTransfers } from "./remove-multi-hop-token-transfers";

const logger = createLogger("aggregate-smart-contract-transactions");

/**
 *  combines transactions with the same transaction id, e.g. contract calls
 *  this function mutates the underlying transactions for performance
 */
export function aggregateSmartContractTransactions(loadedTransactions: RawLoadedTransaction[]): RawLoadedTransaction[] {
  const aggregatedTransactions: RawLoadedTransaction[] = [];
  let runningAggregate: RawLoadedTransaction | null = null;
  loadedTransactions.forEach((t) => {
    if (!runningAggregate) {
      runningAggregate = t;
      return;
    }

    const currentAggregate = runningAggregate;

    if (currentAggregate.transactionId !== t.transactionId) {
      if (currentAggregate._aggregated) {
        removeMultiHopTokenTransfers(currentAggregate);
      }
      aggregatedTransactions.push(currentAggregate);
      runningAggregate = t;
      return;
    }

    logger.info(`dealing with smart contract: ${currentAggregate.transactionId}`);
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
    currentAggregate.nftTransfers = [...currentAggregate.nftTransfers, ...t.nftTransfers];
    currentAggregate.tokenTransfers = [...currentAggregate.tokenTransfers, ...t.tokenTransfers];
    currentAggregate.memo = [currentAggregate.memo, t.memo].filter((m) => m).join(", ");
  });

  if (runningAggregate) {
    aggregatedTransactions.push(runningAggregate);
  }

  return aggregatedTransactions;
}
