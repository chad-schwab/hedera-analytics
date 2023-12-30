import { re } from "../existence-util";
import { LoadedTransaction, RawLoadedTransaction } from "../types";

import { mergeTransactionsByTransactionId as aggregateTransactionsByTransactionId } from "./merge-transactions-by-transaction-id";
import { attributeNftNonTransferTransactions } from "./attribute-non-transfer-nft-transactions";
import { mergeMultipleAccountsTransactions } from "./merge-multiple-accounts-transactions";
import { splitMultiNftTransfers } from "./split-nft-transactions";

export async function transformTransactions(
  targetAccountLoadedTransactions: Record<string, RawLoadedTransaction[]>,
  reportStartDate: Date,
  reportEndDate: Date
) {
  const transactionsByToken: Record<string, LoadedTransaction[]> = {};
  const transactionsByNft: Record<string, Record<number, LoadedTransaction[]>> = {};
  const { mergedTransactions, accountKey } = mergeMultipleAccountsTransactions(targetAccountLoadedTransactions);
  const aggregatedTransactions = aggregateTransactionsByTransactionId(mergedTransactions);
  const nftLoadedTransaction = splitMultiNftTransfers(aggregatedTransactions);

  // TODO: load fungible token exchange rates
  const loadedTransactions: LoadedTransaction[] = nftLoadedTransaction.map((t) => ({
    ...t,
    tokenTransfers: t.tokenTransfers.map((tt) => ({ ...tt, exchangeRate: 0 })),
  }));

  let vanillaTransactions: LoadedTransaction[] = [];
  loadedTransactions.forEach((t) => {
    if (!t.tokenTransfers.length && !t.nftTransfer) {
      vanillaTransactions.push(t);
    }
    if (t.nftTransfer) {
      if (!transactionsByNft[t.nftTransfer.tokenId]) {
        transactionsByNft[t.nftTransfer.tokenId] = {};
      }
      transactionsByNft[t.nftTransfer.tokenId][t.nftTransfer.serialNumber] = [
        ...(transactionsByNft[t.nftTransfer.tokenId][t.nftTransfer.serialNumber] ?? []),
        t,
      ];
    }
    if (t.tokenTransfers.length) {
      t.tokenTransfers.forEach((t1) => {
        transactionsByToken[t1.tokenId] = [...(transactionsByToken[t1.tokenId] ?? []), t];
      });
    }
  });

  const isInTaxYear = (t: { timestamp: Date }) => t.timestamp >= reportStartDate && t.timestamp <= reportEndDate;
  vanillaTransactions = attributeNftNonTransferTransactions(vanillaTransactions, transactionsByNft);
  const loadedTransactionsInTaxYear = loadedTransactions.filter(isInTaxYear);
  const vanillaTransactionsInTaxYear = vanillaTransactions.filter(isInTaxYear);
  const soldTokens = Object.entries(transactionsByToken)
    .map(([tokenId, transactions]) => ({
      tokenId,
      transactions,
      tokenSymbol: re(transactions[0].tokenTransfers.find((t) => t.tokenId === tokenId)?.tokenSymbol, "Should find token symbol in transaction"),
    }))
    .filter(({ tokenId, transactions }) =>
      transactions.filter(isInTaxYear).find(
        (t1) =>
          // Did we send tokens and did we get paid for it
          t1.tokenTransfers.find((t2) => t2.tokenId === tokenId && t2.decimalAmount < 0) && t1.hbarTransfer > 1
      )
    )
    .sort((t1, t2) => t1.tokenSymbol.localeCompare(t2.tokenSymbol));
  const soldNfts = Object.entries(transactionsByNft)
    .flatMap(([tokenId, transactionsBySerial]) =>
      Object.entries(transactionsBySerial).map(([serialNumber, transactions]) => ({
        tokenId,
        serialNumber: parseInt(serialNumber, 10),
        transactions,
        tokenSymbol: transactions.find((n) => n.nftTransfer)?.nftTransfer?.tokenSymbol ?? "unknown",
      }))
    )
    .filter(({ tokenId, serialNumber, transactions }) =>
      transactions.filter(isInTaxYear).find(
        (t1) =>
          // Did we send an NFT and did we get paid for it?
          t1.nftTransfer &&
          t1.nftTransfer.tokenId === tokenId &&
          t1.nftTransfer.serialNumber === serialNumber &&
          t1.nftTransfer.senderAccount === accountKey &&
          t1.hbarTransfer > 1
      )
    );

  return {
    accountKey,
    loadedTransactions,
    vanillaTransactions,
    soldTokens,
    soldNfts,
    loadedTransactionsInTaxYear,
    vanillaTransactionsInTaxYear,
    transactionsByToken,
    transactionsByNft,
  };
}
