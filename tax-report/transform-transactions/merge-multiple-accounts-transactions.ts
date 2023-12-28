import { RawLoadedTransaction } from "../types";

function rekeyAccountTransactions(newAccountKey: string, accountTransactions: Record<string, RawLoadedTransaction[]>) {
  const transformedTransactions: RawLoadedTransaction[][] = Object.entries(accountTransactions).map(([accountId, transactions]) => {
    const aggregateKeyReplacer = (account: string) => (account === accountId ? newAccountKey : account);
    return transactions.map((t) => ({
      ...t,
      tokenTransfers: t.tokenTransfers.map((tt) => ({ ...tt, account: aggregateKeyReplacer(tt.account) })),
      nftTransfers: t.nftTransfers.map((nt) => ({
        ...nt,
        receiverAccount: aggregateKeyReplacer(nt.receiverAccount),
        senderAccount: aggregateKeyReplacer(nt.senderAccount),
      })),
    }));
  });
  return transformedTransactions;
}

export function mergeMultipleAccountsTransactions(accountTransactions: Record<string, RawLoadedTransaction[]>) {
  const allAccounts = Object.keys(accountTransactions);
  if (allAccounts.length <= 1) {
    return { mergedTransactions: Object.values(accountTransactions)[0] ?? [], accountKey: allAccounts[0] };
  }

  const accountKey = allAccounts.sort().join(":");
  const transformedTransactions: RawLoadedTransaction[][] = rekeyAccountTransactions(accountKey, accountTransactions);

  const sortIndexes = transformedTransactions.map(() => 0);
  const totalLength = transformedTransactions.reduce((acc, cur) => acc + cur.length, 0);
  const maxDate = new Date(8640000000000000);
  const mergedTransactions = new Array<RawLoadedTransaction>(totalLength);
  for (let i = 0; i < totalLength; i++) {
    const currentMin = transformedTransactions.reduce(
      (agg, transactions, index) => {
        if (transactions.length === sortIndexes[index]) {
          return agg;
        }
        const transactionTimestamp = transactions[sortIndexes[index]].timestamp;
        if (transactionTimestamp < agg.minTimestamp) {
          agg.minTimestamp = transactionTimestamp;
          agg.minTimestampIndex = index;
        }
        return agg;
      },
      { minTimestamp: maxDate, minTimestampIndex: -1 } as { minTimestamp: Date; minTimestampIndex: number }
    );
    mergedTransactions[i] = transformedTransactions[currentMin.minTimestampIndex][sortIndexes[currentMin.minTimestampIndex]];
    sortIndexes[currentMin.minTimestampIndex]++;
  }

  return { mergedTransactions, accountKey };
}
