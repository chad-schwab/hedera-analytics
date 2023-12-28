/**
 * Calculates the Hbar attributions for each NFT transfer in a transaction.
 *
 * This function estimates the Hbar price of each NFT using the information available in the transfer.
 * It is designed to handle bulk NFT purchases or sales, but may not handle NFT to NFT trades or trades with FTs.
 *
 * @param transaction - The transaction object containing NFT transfers.
 * @param netTransfer - The net transfer amount in Hbar.
 * @returns An array of Hbar attributions for each NFT transfer.
 */

import { createLogger } from "../../logger";
import { requireExistence as re } from "../existence-util";
import { isHederaSystemAccount, tinyToHbar } from "../hedera-utils";
import { TransactionByIdResponse } from "../types";

import { calculateHbarGL } from "./calculate-hbar-gl";

const logger = createLogger("calculate-nft-hbar-attribution");

/**
 * Estimate the hbar price of each nft using the information available in the transfer. This isn't perfect.
 * It won't handle NFT to NFT trades, or trades with FTs, but I've never done a trade like that.
 * The hope is this will handle bulk NFT purchases or sales.
 * @param transaction
 * @param netTransfer
 * @returns
 */
export function calculateNftHbarAttributions(transaction: NonNullable<TransactionByIdResponse["transactions"]>[0], netTransfer: number) {
  const transactionNftTransfers = transaction.nft_transfers;
  if (!transactionNftTransfers?.length) {
    return [];
  }
  if (transactionNftTransfers.length === 1) {
    return [netTransfer];
  }

  const estimatedNftHbarPrices = transactionNftTransfers.map((t) =>
    Math.max(
      0,
      calculateHbarGL(transaction, re(t.sender_account_id)).netTransfer /
        transactionNftTransfers.filter((t1) => t1.sender_account_id === re(t.sender_account_id)).length
    )
  );
  const totalHbarNftCosts = estimatedNftHbarPrices.reduce((acc, t) => acc + t);
  const hbarPriceAttributionFactor = totalHbarNftCosts === 0 ? 0 : netTransfer / totalHbarNftCosts;
  let nftTransferHbarAttribution = transactionNftTransfers.map((_, i) => estimatedNftHbarPrices[i] * hbarPriceAttributionFactor);
  // sanity check hbar attribution
  const allFees = transaction.transfers?.filter((t) => t.amount > 0 && isHederaSystemAccount(t.account)).reduce((acc, t) => acc + t.amount, 0) ?? 0;
  const sanityTolerance = tinyToHbar(allFees) * 2;
  const hbarAttributionSum = nftTransferHbarAttribution.reduce((acc, t) => acc + t);
  if (Math.abs(hbarAttributionSum - netTransfer) > sanityTolerance) {
    logger.warn(
      `Hbar attribution does not match net transfer for transaction: ${transaction.transaction_id}. ${hbarAttributionSum} vs ${netTransfer}. An average will be used instead.`
    );
    nftTransferHbarAttribution = nftTransferHbarAttribution.map(() => netTransfer / nftTransferHbarAttribution.length);
  } else if (hbarAttributionSum !== netTransfer) {
    // split the small difference between the attributions
    const attributionBoost = (netTransfer - hbarAttributionSum) / nftTransferHbarAttribution.length;
    nftTransferHbarAttribution = nftTransferHbarAttribution.map((t) => t + attributionBoost);
  }
  return nftTransferHbarAttribution;
}
