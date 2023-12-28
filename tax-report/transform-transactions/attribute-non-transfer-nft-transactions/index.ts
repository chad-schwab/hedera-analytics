import { LoadedTransaction } from "../../types";
import { createLogger } from "../../../logger";

import { extractSerialFromTokenMemo } from "./extract-serial-from-token-memo";
import { isMemoTokenReference } from "./is-memo-token-reference";
import { isMemoSuspectedNft } from "./is-memo-suspected-nft";

const logger = createLogger("attribute-non-transfer-nft-transactions");

/**
 * Attempts to find all transactions involving an NFT that were not transfer transactions. These would include nft allowance and allowance removals.
 *
 * We have to search the memo because the transaction response from the mirror very oddly does not include allowance information.
 */
export function attributeNftNonTransferTransactions(
  vanillaTransactions: LoadedTransaction[],
  transactionsByNft: Record<string, Record<number, LoadedTransaction[]>>
) {
  return vanillaTransactions.filter((t) => {
    if (isMemoSuspectedNft(t.memo)) {
      const foundTokenId = Object.keys(transactionsByNft).find((tokenId) => isMemoTokenReference(t.memo, tokenId));
      if (!foundTokenId) {
        logger.info(`Unable to find token id ${t.memo} for suspected NFT`);
      } else {
        const serialNumber = extractSerialFromTokenMemo(t, foundTokenId);
        if (serialNumber === null) {
          logger.info(`Unable to find serial number in ${t.memo} for suspected NFT with token id: ${foundTokenId}`);
        } else {
          t._attributedNft = `${foundTokenId}:${serialNumber}`;
          const existingRows: LoadedTransaction[] = transactionsByNft[foundTokenId][serialNumber];
          if (!existingRows) {
            transactionsByNft[foundTokenId][serialNumber] = [t];
          } else {
            // insert new transaction in sort order as we know transactions are already sorted this is efficient
            const sortedInsertionIndex =
              existingRows.findIndex((existingTransaction) => existingTransaction.timestamp > t.timestamp) ?? existingRows.length;
            existingRows.splice(sortedInsertionIndex, 0, t);
          }
          return false;
        }
      }
    }
    return true;
  });
}
