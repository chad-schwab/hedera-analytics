import path from "node:path";

import { program } from "commander";
import dotenv from "dotenv";
import { configure, Environment, Network } from "lworks-client";

import { createLogger } from "../logger";

import { dateToHederaTs } from "./hedera-utils";
import { loadTransactions } from "./load-transactions";
import { prepareOutDirectories } from "./prepare-out-directory";
import { transformTransactions } from "./transform-transactions";
import { RawLoadedTransaction } from "./types";
import { writeCsv } from "./write-csv";

dotenv.config();
// https://server.saucerswap.finance/api/public/tokens/prices/0.0.2030869?interval=DAY&from=1653022800&to=1684584750

program.name("tax-report").description("CLI to load transaction tax information").version("0.0.1");

export const logger = createLogger("tax-report");

configure({ environment: Environment.public, network: Network.Mainnet, disableTracking: true });

async function loadTransactionData(account: string, dataStartDate: Date, reportEndDate: Date): Promise<RawLoadedTransaction[]> {
  const dataStartTs = dateToHederaTs(dataStartDate, false);
  const dataEndTs = dateToHederaTs(reportEndDate, true);

  return loadTransactions(account, dataStartTs, dataEndTs);
}

program
  .description(
    "Load Hedera transactions for a wallet and generate comprehensive financial information, including USD conversions, simplified multi-hop transfers, and more. Merge transactions from multiple accounts to create a unified view, as if multiple accounts were one."
  )
  .argument("<account>", "The account(s) to fetch data for. Input a CSV list of accounts to merge transactions from multiple accounts.")
  .argument("<year>", "The tax year to fetch data for", (y) => parseInt(y, 10))
  .option("--overrideDataStart <string>", "Override the start date, ISO string", (d) => new Date(d))
  // eslint-disable-next-line sonarjs/cognitive-complexity
  .action(async (account: string, year: number, options: Partial<{ overrideDataStart: Date }>) => {
    const reportStartDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const reportEndDate = new Date(`${year}-12-31T23:59:59.999Z`);
    const dataStartDate = options.overrideDataStart ?? new Date(`${year - 2}-01-01T00:00:00.000Z`);
    logger.info({ reportStartDate, reportEndDate, dataStartDate }, "Running tax-report");
    try {
      const rawLoadedTransactions = await loadTransactionData(account, dataStartDate, reportEndDate);
      // loaded transactions are mutated during processing, so write them to disc first
      const directories = await prepareOutDirectories(year, account);

      // TODO: Accept and load multiple account transaction data
      const {
        loadedTransactions,
        vanillaTransactions,
        vanillaTransactionsInTaxYear,
        loadedTransactionsInTaxYear,
        transactionsByToken,
        transactionsByNft,
        soldTokens,
        soldNfts,
      } = await transformTransactions({ [account]: rawLoadedTransactions }, reportStartDate, reportEndDate);

      await Promise.all([
        writeCsv(account, loadedTransactions, path.join(directories.allTimeDir, "all-transactions.csv")),
        writeCsv(account, vanillaTransactions, path.join(directories.allTimeDir, "vanilla-transactions.csv"), {
          nftStrategy: { strategy: "omit" },
          tokenStrategy: { strategy: "omit" },
        }),
        writeCsv(account, Object.values(transactionsByToken).flat(), path.join(directories.allTimeDir, "token-transactions.csv"), {
          stakingStrategy: { strategy: "omit" },
          nftStrategy: { strategy: "omit" },
          tokenStrategy: { strategy: "column", allTokens: soldTokens },
        }),
        writeCsv(
          account,
          Object.values(transactionsByNft)
            .map((t) => Object.values(t))
            .flat(2),
          path.join(directories.allTimeDir, "nft-transactions.csv"),
          { stakingStrategy: { strategy: "omit" }, tokenStrategy: { strategy: "omit" } }
        ),
        writeCsv(account, vanillaTransactionsInTaxYear, path.join(directories.outputDir, "vanilla-transactions.csv"), {
          nftStrategy: { strategy: "omit" },
          tokenStrategy: { strategy: "omit" },
        }),
        writeCsv(account, loadedTransactionsInTaxYear, path.join(directories.outputDir, "all-transactions.csv")),
        ...soldTokens.map(({ tokenId, tokenSymbol, transactions }) =>
          writeCsv(account, transactions, path.join(directories.soldTokensDir, `${tokenSymbol}-${tokenId}.csv`), {
            stakingStrategy: { strategy: "omit" },
            nftStrategy: { strategy: "omit" },
            tokenStrategy: { strategy: "column", allTokens: soldTokens, targetTokenId: tokenId },
          })
        ),
        writeCsv(
          account,
          soldTokens.flatMap((t) => t.transactions).sort((t1, t2) => t1.consensusTimestamp.localeCompare(t2.consensusTimestamp)),
          path.join(directories.soldTokensDir, "all.csv"),
          { stakingStrategy: { strategy: "omit" }, nftStrategy: { strategy: "omit" }, tokenStrategy: { strategy: "column", allTokens: soldTokens } }
        ),
        ...soldNfts.map(
          ({ tokenSymbol, tokenId, serialNumber, transactions }) =>
            writeCsv(account, transactions, path.join(directories.soldNftsDir, `${tokenSymbol}-${tokenId}:${serialNumber}.csv`), {
              stakingStrategy: { strategy: "omit" },
              tokenStrategy: { strategy: "omit" },
            }),
          writeCsv(
            account,
            soldNfts.flatMap((t) => t.transactions).sort((t1, t2) => t1.consensusTimestamp.localeCompare(t2.consensusTimestamp)),
            path.join(directories.soldNftsDir, "all.csv"),
            { stakingStrategy: { strategy: "omit" }, tokenStrategy: { strategy: "omit" } }
          )
        ),
      ]);
    } catch (e) {
      logger.error(e);
      process.exit(1);
    }
  });

program.parse();
