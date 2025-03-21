import { LoadedTokenTransfer, RawLoadedTransaction, SplitNftLoadedTransaction } from "../types";

// load token prices using this endpoint: https://api.saucerswap.finance/tokens/prices/usd/<tokenId>?from=<unix ts>&to=<unix ts>&interval=HOUR
// valid intervals
// * FIVEMIN
// * HOUR
// * DAY
// * WEEK

function doSplit(transaction: RawLoadedTransaction): SplitNftLoadedTransaction[] {
  const numberOfSplits = transaction.nftTransfers.length;
  if (numberOfSplits <= 1) {
    return [{ ...transaction, nftTransfer: transaction.nftTransfers.at(0) }];
  }

  return transaction.nftTransfers.map((nt) => ({
    ...transaction,
    hbarTransfer: nt.hbarAttribution,
    stakingReward: transaction.stakingReward / numberOfSplits,
    tokenTransfers: transaction.tokenTransfers.map((tt) => ({ ...tt, decimalAmount: tt.decimalAmount / numberOfSplits } as LoadedTokenTransfer)),
    nftTransfer: nt,
    _splitNfts: true,
  }));
}

/**
 * This splits apart transactions involving multiple NFTs so we can attribute crypto transfers to each serial. An estimated price is calculated using the estimated hbar transfer to each receiver account.
 * Manual action may need to be taken to adjust true value per NFT.
 *
 * We also load the exchange rate for each token transfer.
 */
export function splitMultiNftTransfers(loadedTransactions: RawLoadedTransaction[]): SplitNftLoadedTransaction[] {
  return loadedTransactions.flatMap(doSplit);
}
