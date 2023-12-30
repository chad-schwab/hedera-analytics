import { program } from "commander";
import dotenv from "dotenv";
import { configure, Environment, Network } from "lworks-client";

import { createLogger } from "../logger";

import { loadAccountsTransactions } from "./load-transactions";
import { transformTransactions } from "./transform-transactions";
import { writeTransformedTransactions } from "./write-transaction-report";

dotenv.config();
// https://server.saucerswap.finance/api/public/tokens/prices/0.0.2030869?interval=DAY&from=1653022800&to=1684584750

program.name("tax-report").description("CLI to load transaction tax information").version("0.0.1");

export const logger = createLogger("tax-report");

configure({ environment: Environment.public, network: Network.Mainnet, disableTracking: true });

program
  .description(
    "Load Hedera transactions for a wallet and generate comprehensive financial information, including USD conversions, simplified multi-hop transfers, and more. Merge transactions from multiple accounts to create a unified view, as if multiple accounts were one."
  )
  .argument("<account>", "The account(s) to fetch data for. Input a CSV list of accounts to merge transactions from multiple accounts.", (accounts) =>
    accounts.split(/[\s;,]/).map((a) => a.trim())
  )
  .argument("<year>", "The tax year to fetch data for", (y) => parseInt(y, 10))
  .option("--overrideDataStart <string>", "Override the start date, ISO string", (d) => new Date(d))
  // eslint-disable-next-line sonarjs/cognitive-complexity
  .action(async (accounts: string[], year: number, options: Partial<{ overrideDataStart: Date }>) => {
    const reportStartDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const reportEndDate = new Date(`${year}-12-31T23:59:59.999Z`);
    const dataStartDate = options.overrideDataStart ?? new Date(`${year - 2}-01-01T00:00:00.000Z`);
    logger.info({ accounts, reportStartDate, reportEndDate, dataStartDate }, "Running tax-report");
    try {
      const loadedTransactionData = await loadAccountsTransactions(accounts, dataStartDate, reportEndDate);
      const transformedData = await transformTransactions(loadedTransactionData, reportStartDate, reportEndDate);
      await writeTransformedTransactions(year, transformedData);
    } catch (e) {
      logger.error(e);
      process.exit(1);
    }
  });

program.parse();
