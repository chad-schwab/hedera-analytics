import { LoadedTokenTransfer } from "../types";

/**
 * We don't care about multi-hop token transfers that zero out.
 * This also captures merged account transactions (i.e. intra-wallet transfers that were previously merged)
 *
 * This function mutates the underlying transactions for performance
 */
export function removeZeroedTokenTransfers(tokenTransfers: LoadedTokenTransfer[]) {
  if (tokenTransfers.length <= 1) {
    return tokenTransfers;
  }

  const tokenTransferAmountByAccountToken = new Map<string, LoadedTokenTransfer>();
  tokenTransfers.forEach((t) => {
    const key = `${t.account}:${t.tokenId}`;
    const current = tokenTransferAmountByAccountToken.get(key);
    if (!current) {
      tokenTransferAmountByAccountToken.set(key, t);
    } else {
      current.decimalAmount += t.decimalAmount;
    }
  });
  return Array.from(tokenTransferAmountByAccountToken.entries())
    .map(([_, v]) => v)
    .filter((v) => v.decimalAmount !== 0);
}
