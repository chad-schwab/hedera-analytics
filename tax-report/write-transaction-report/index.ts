import path from "node:path";

import { transformTransactions } from "../transform-transactions";

import { prepareOutDirectories } from "./prepare-out-directory";
import { writeCsv } from "./write-csv";

export async function writeTransformedTransactions(year: number, transformedData: Awaited<ReturnType<typeof transformTransactions>>) {
  const {
    accountKey,
    loadedTransactions,
    vanillaTransactions,
    vanillaTransactionsInTaxYear,
    loadedTransactionsInTaxYear,
    transactionsByToken,
    transactionsByNft,
    soldTokens,
    soldNfts,
  } = transformedData;
  const directories = await prepareOutDirectories(year, accountKey);
  await Promise.all([
    writeCsv(accountKey, loadedTransactions, path.join(directories.allTimeDir, "all-transactions.csv")),
    writeCsv(accountKey, vanillaTransactions, path.join(directories.allTimeDir, "vanilla-transactions.csv"), {
      nftStrategy: { strategy: "omit" },
      tokenStrategy: { strategy: "omit" },
    }),
    writeCsv(accountKey, Object.values(transactionsByToken).flat(), path.join(directories.allTimeDir, "token-transactions.csv"), {
      stakingStrategy: { strategy: "omit" },
      nftStrategy: { strategy: "omit" },
      tokenStrategy: { strategy: "column", allTokens: soldTokens },
    }),
    writeCsv(
      accountKey,
      Object.values(transactionsByNft)
        .map((t) => Object.values(t))
        .flat(2),
      path.join(directories.allTimeDir, "nft-transactions.csv"),
      { stakingStrategy: { strategy: "omit" }, tokenStrategy: { strategy: "omit" } }
    ),
    writeCsv(accountKey, vanillaTransactionsInTaxYear, path.join(directories.outputDir, "vanilla-transactions.csv"), {
      nftStrategy: { strategy: "omit" },
      tokenStrategy: { strategy: "omit" },
    }),
    writeCsv(accountKey, loadedTransactionsInTaxYear, path.join(directories.outputDir, "all-transactions.csv")),
    ...soldTokens.map(({ tokenId, tokenSymbol, transactions }) =>
      writeCsv(accountKey, transactions, path.join(directories.soldTokensDir, `${tokenSymbol}-${tokenId}.csv`), {
        stakingStrategy: { strategy: "omit" },
        nftStrategy: { strategy: "omit" },
        tokenStrategy: { strategy: "column", allTokens: soldTokens, targetTokenId: tokenId },
      })
    ),
    writeCsv(
      accountKey,
      soldTokens.flatMap((t) => t.transactions).sort((t1, t2) => t1.consensusTimestamp.localeCompare(t2.consensusTimestamp)),
      path.join(directories.soldTokensDir, "all.csv"),
      { stakingStrategy: { strategy: "omit" }, nftStrategy: { strategy: "omit" }, tokenStrategy: { strategy: "column", allTokens: soldTokens } }
    ),
    ...soldNfts.map(
      ({ tokenSymbol, tokenId, serialNumber, transactions }) =>
        writeCsv(accountKey, transactions, path.join(directories.soldNftsDir, `${tokenSymbol}-${tokenId}:${serialNumber}.csv`), {
          stakingStrategy: { strategy: "omit" },
          tokenStrategy: { strategy: "omit" },
        }),
      writeCsv(
        accountKey,
        soldNfts.flatMap((t) => t.transactions).sort((t1, t2) => t1.consensusTimestamp.localeCompare(t2.consensusTimestamp)),
        path.join(directories.soldNftsDir, "all.csv"),
        { stakingStrategy: { strategy: "omit" }, tokenStrategy: { strategy: "omit" } }
      )
    ),
  ]);
}
