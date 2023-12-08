import { TokenLoadedTransaction, LoadedTokenTransfer, RawLoadedTransaction } from "../types";

/**
 * This splits apart transactions involving multiple NFTs so we can attribute crypto transfers to each serial. A simple average is used for attribution.
 * Manual action may need to be taken to adjust true value per NFT.
 *
 * We also load the exchange rate for each token transfer.
 */
export function loadTransactionTokenInfo(loadedTransactions: RawLoadedTransaction[]): TokenLoadedTransaction[] {
  return (
    loadedTransactions
      .map((t) => {
        const numberOfSplits = t.nftTransfers.length;
        if (numberOfSplits <= 1) {
          return { ...t, nftTransfers: undefined, nftTransfer: t.nftTransfers[0] };
        }
        return t.nftTransfers.map((nt) => ({
          ...t,
          hbarTransfer: t.hbarTransfer / numberOfSplits,
          stakingReward: t.stakingReward / numberOfSplits,
          tokenTransfers: t.tokenTransfers.map((tt) => ({ ...tt, decimalAmount: tt.decimalAmount / numberOfSplits } as LoadedTokenTransfer)),
          nftTransfer: nt,
          _splitNfts: true,
        }));
      })
      .flat()
      // TODO: load fungible token prices
      .map((t) => ({ ...t, tokenTransfers: t.tokenTransfers.map((tt) => ({ ...tt, exchangeRate: -1 })) }))
  );
}
