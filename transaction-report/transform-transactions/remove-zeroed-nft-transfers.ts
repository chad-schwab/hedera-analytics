import { LoadedNftTransfer } from "../types";

/**
 * Remove NFT intra-wallet NFT transfers for accounts that were previously merged
 *
 * For merged transactions, this is as simple as removing all nft transfers where the sender and receiver are the same
 */
export function removeZeroedNftTransfers(nftTransfers: LoadedNftTransfer[]) {
  if (nftTransfers.length <= 1) {
    return nftTransfers;
  }

  return nftTransfers.filter((t) => t.receiverAccount !== t.senderAccount);
}
