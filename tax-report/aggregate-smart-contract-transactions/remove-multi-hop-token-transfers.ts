import { LoadedTokenTransfer, RawLoadedTransaction } from "../types";

/**
 * for smart contract transactions, we don't care about multi-hop token transfers that zero out
 */
export function removeMultiHopTokenTransfers(aggregate: RawLoadedTransaction) {
  const tokenTransferAmountByAccountToken = new Map<string, LoadedTokenTransfer>();
  aggregate.tokenTransfers.forEach((t) => {
    const key = `${t.account}:${t.tokenId}`;
    const current = tokenTransferAmountByAccountToken.get(key);
    if (!current) {
      tokenTransferAmountByAccountToken.set(key, t);
    } else {
      current.decimalAmount += t.decimalAmount;
    }
  });
  aggregate.tokenTransfers = Array.from(tokenTransferAmountByAccountToken.entries())
    .map(([_, v]) => v)
    .filter((v) => v.decimalAmount !== 0);
}
