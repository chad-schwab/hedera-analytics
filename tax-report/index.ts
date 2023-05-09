import { AccountId } from "@hashgraph/sdk";
import { program } from "commander";
import { stringify } from "csv-stringify";
import dotenv from "dotenv";
import { callMirror, configure, MirrorResponse, Network } from "lworks-client";

import { mkdirSync, readdirSync, readFileSync, statSync, writeFile, writeFileSync } from "node:fs";
import path from "node:path";
import { LoadedNftTransfer, LoadedTokenTransfer, RawLoadedTransaction, LoadedTransaction } from "./types";
import { writeCsv } from "./csv";

dotenv.config();

program.name("tax-report").description("CLI to load transaction tax information").version("0.0.1");

configure({ network: Network.Mainnet, disableTracking: true });

type Transaction = MirrorResponse.Schemas["Transaction"];
type TransactionsResponse = MirrorResponse.Schemas["TransactionsResponse"];
type TransactionByIdResponse = MirrorResponse.Schemas["TransactionByIdResponse"];
type TokenInfo = MirrorResponse.Schemas["TokenInfo"];
type ExchangeRateResponse = MirrorResponse.Schemas["NetworkExchangeRateSetResponse"];
type ExchangeRate = MirrorResponse.Schemas["ExchangeRate"];

if (process.env.LOG_LEVEL !== "debug") {
  console.debug = () => {};
}

const baseDir = path.join(__dirname, "..", "output", "tax-report");
const archiveTransactionsFileName = "transaction-archive.json";
function getRunDir(year: number, account: string) {
  return path.join(baseDir, year.toString(), account);
}
async function prepareOutDirectories(year: number, loadedTransactions: RawLoadedTransaction[], account: string) {
  const outputDir = path.join(getRunDir(year, account), new Date().toISOString());
  const allTimeDir = path.join(outputDir, "all-time");
  const soldTokensDir = path.join(outputDir, "sold-tokens");
  const soldNftsDir = path.join(outputDir, "sold-nfts");
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(allTimeDir);
  mkdirSync(soldTokensDir);
  mkdirSync(soldNftsDir);
  writeFileSync(path.join(outputDir, archiveTransactionsFileName), JSON.stringify(loadedTransactions, null, 2));
  return { outputDir, allTimeDir, soldTokensDir, soldNftsDir };
}
type FileInfo = {
  filePath: string;
  modifiedTime: number;
};

function findLastModifiedFileByName(directory: string, fileName: string): string | null {
  let lastModified: FileInfo | null = null;
  const files = readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      const nestedFile = findLastModifiedFileByName(filePath, fileName);

      if (nestedFile) {
        const modifiedTime = statSync(nestedFile).mtimeMs;

        if (!lastModified || modifiedTime > lastModified.modifiedTime) {
          lastModified = { filePath: nestedFile, modifiedTime };
        }
      }
    } else if (file === fileName) {
      const modifiedTime = stat.mtimeMs;

      if (!lastModified || modifiedTime > lastModified.modifiedTime) {
        lastModified = { filePath, modifiedTime };
      }
    }
  }

  return lastModified ? lastModified.filePath : null;
}

function dateToHederaTs(date: Date, maxNanos: boolean) {
  const millisecondString = `${date.getTime()}`;
  let hederaString = millisecondString.slice(0, millisecondString.length - 3) + "." + millisecondString.slice(millisecondString.length - 3);
  if (maxNanos) {
    hederaString += "999999";
  } else {
    hederaString += "000000";
  }
  return hederaString;
}

function hederaTsToDate(hederaTs: string) {
  return new Date(parseInt(hederaTs.split(".")[0], 10) * 1000);
}

function tinyToHbar(tinyBar: number) {
  return tinyBar / 100000000;
}

const tokenRequestCache: Record<string, Promise<TokenInfo>> = {};
async function loadTokenInfo(tokenId: string) {
  if (!tokenRequestCache[tokenId]) {
    tokenRequestCache[tokenId] = callMirror<TokenInfo>(`/api/v1/tokens/${tokenId}`);
  }
  return tokenRequestCache[tokenId];
}

const getNearestMinute = (date: Date) => Math.floor(date.getTime() / 60_000);
const getRate = (er: ExchangeRate) => 0.01 * (er.cent_equivalent / er.hbar_equivalent);
let cachedExchangeRates: Record<number, Promise<ExchangeRateResponse>> = {};
async function getExchangeRate(date: Date, recursed = false) {
  const nearestMinute = getNearestMinute(date);
  const nearestPreviousMinute = nearestMinute - 60;
  const cachedRate = cachedExchangeRates[nearestMinute];
  if (cachedRate) {
    const currentRate = await cachedRate;
    if (currentRate.current_rate) {
      return getRate((await cachedRate).current_rate);
    } else console.warn({ date, currentRate }, "exchange rate not found");
  }
  const cachedPreviousRate = cachedExchangeRates[nearestPreviousMinute];
  if (cachedPreviousRate) {
    const previousRate = await cachedPreviousRate;
    if (previousRate.next_rate) {
      return getRate(previousRate.next_rate);
    }
  }

  if (recursed) {
    throw new Error(`Failed to load exchange rate for ${date}`);
  }

  cachedExchangeRates[nearestMinute] = callMirror<ExchangeRateResponse>(`/api/v1/network/exchangerate?timestamp=${dateToHederaTs(date, false)}`);
  return getExchangeRate(date, true);
}
function attributeNftNonTransferTransactions(
  vanillaTransactions: LoadedTransaction[],
  transactionsByNft: Record<string, Record<number, LoadedTransaction[]>>
) {
  const tokenRegExpMap = Object.keys(transactionsByNft).reduce((agg, tokenId) => {
    agg.set(tokenId, {
      tokenRegex: new RegExp(`[^\\d]${tokenId}[^\\d]`),
      serialRegex: new RegExp(`|${tokenId}.(\\d+)`),
    });
    return agg;
  }, new Map<string, { tokenRegex: RegExp; serialRegex: RegExp }>());
  return vanillaTransactions.filter((t) => {
    if (t.memo.toLowerCase().match(/ nft[: ]/i)) {
      const foundTokenId = Object.keys(transactionsByNft).find((tokenId) => t.memo.match(tokenRegExpMap.get(tokenId).tokenRegex));
      if (!foundTokenId) {
        console.info("Unable to find token id " + t.memo + " for suspected NFT");
      } else {
        const serialNumberMatch =
          t.memo.match(/serial number (\d+) /i) || t.memo.match(/serial (\d+) /i) || t.memo.match(tokenRegExpMap.get(foundTokenId).serialRegex);
        if (!serialNumberMatch) {
          console.info("Unable to find serial number in " + t.memo + " for suspected NFT with token id: " + foundTokenId);
        } else {
          const serialNumber = serialNumberMatch[1];
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

async function loadTransactions(accountId: string, items: Transaction[]): Promise<RawLoadedTransaction[]> {
  return Promise.all(
    items.map(async (i) => {
      let tokenTransfers: LoadedTokenTransfer[] = [];
      let nftTransfers: LoadedNftTransfer[] = [];
      const memo = Buffer.from(i.memo_base64, "base64").toString();
      if (i.token_transfers?.length) {
        const tokenInfos = await Promise.all(i.token_transfers.map((t) => loadTokenInfo(t.token_id)));

        tokenTransfers = i.token_transfers.map((t, i) => {
          const tokenInfo = tokenInfos[i];
          return {
            tokenId: tokenInfo.token_id,
            tokenName: tokenInfo.name,
            tokenSymbol: tokenInfo.symbol,
            account: t.account,
            decimalAmount: tokenInfo.decimals ? t.amount / Math.pow(10, parseInt(tokenInfo.decimals, 10)) : t.amount,
          };
        });
      }
      const response = await callMirror<TransactionByIdResponse>(`/api/v1/transactions/${i.transaction_id}`);
      const transactionNftTransfers = response.transactions?.filter((t) => t.nft_transfers?.length).flatMap((t) => t.nft_transfers);
      if (transactionNftTransfers?.length) {
        const tokenInfos = await Promise.all(transactionNftTransfers.map((t) => loadTokenInfo(t.token_id)));

        nftTransfers = transactionNftTransfers.map((t, i) => {
          const tokenInfo = tokenInfos[i];
          return {
            tokenId: tokenInfo.token_id,
            serialNumber: t.serial_number,
            tokenName: tokenInfo.name,
            tokenSymbol: tokenInfo.symbol,
            senderAccount: t.sender_account_id,
            receiverAccount: t.receiver_account_id,
          };
        });
      }
      const stakingReward = i.staking_reward_transfers?.find((s) => s.account === accountId)?.amount ?? 0;
      const transfer = i.transfers.find((a) => a.account === accountId)?.amount ?? 0;
      const netTransfer = transfer - stakingReward;
      return {
        transactionId: i.transaction_id,
        timestamp: hederaTsToDate(i.consensus_timestamp),
        hbarToAccount: i.transfers.filter((t) => t.amount > 0 && AccountId.fromString(t.account).num.gt(999)).map((t) => t.account),
        hbarFromAccount: i.transfers.filter((t) => t.amount < 0 && AccountId.fromString(t.account).num.gt(999)).map((t) => t.account),
        hbarTransfer: tinyToHbar(netTransfer),
        stakingReward: tinyToHbar(stakingReward),
        memo,
        exchangeRate: await getExchangeRate(hederaTsToDate(i.consensus_timestamp)),
        tokenTransfers: tokenTransfers.filter((t) => t.account === accountId),
        nftTransfers: nftTransfers.filter((t) => t.senderAccount === accountId || t.receiverAccount === accountId),
        consensusTimestamp: i.consensus_timestamp,
      };
    })
  );
}

async function loadAllTransactions(account: string, dataStartDate: Date, endTimestamp: string, sourceFile: string | undefined) {
  let dataStartTs = dateToHederaTs(dataStartDate, false);
  let loadedTransactions: RawLoadedTransaction[] = [];
  if (sourceFile) {
    if (!sourceFile.endsWith(archiveTransactionsFileName)) {
      sourceFile = findLastModifiedFileByName(sourceFile, archiveTransactionsFileName);
      if (!sourceFile) {
        throw new Error(`Unable to find deeply nested ${archiveTransactionsFileName} in directory: ${sourceFile}`);
      }
      console.info(`Using source file: ${sourceFile}`);
    }
    loadedTransactions = JSON.parse(readFileSync(sourceFile).toString("utf-8")) as RawLoadedTransaction[];
    loadedTransactions.forEach((l) => {
      l.timestamp = new Date(l.timestamp);
      if (typeof l.hbarFromAccount === "string") {
        l.hbarFromAccount = (l.hbarFromAccount as String).split(",");
      }
      if (typeof l.hbarToAccount === "string") {
        l.hbarToAccount = (l.hbarToAccount as String).split(",");
      }
    });

    const finalTransaction = loadedTransactions.at(-1);
    dataStartTs = finalTransaction.consensusTimestamp;
  }

  let next: string | undefined = `/api/v1/transactions?account.id=${account}&limit=25&order=asc&timestamp=gte:${dataStartTs}`;
  while (next) {
    console.debug("loading transaction: " + next);
    const response = await callMirror<TransactionsResponse>(next);
    if (response.transactions) {
      // filter out duplicates that can happen when loading transactions from disk
      let newTransactions = loadedTransactions.length
        ? response.transactions.filter((t) => t.consensus_timestamp > loadedTransactions.at(-1).consensusTimestamp)
        : response.transactions;
      const endTransactionIndex = newTransactions.findIndex((t) => t.consensus_timestamp > endTimestamp);
      if (endTransactionIndex !== -1) {
        const finalTransactions = newTransactions.slice(0, endTransactionIndex);
        console.debug("Adding final transactions. Count: ", finalTransactions.length);
        loadedTransactions = loadedTransactions.concat(await loadTransactions(account, newTransactions.slice(0, endTransactionIndex)));
        break;
      }
      loadedTransactions = loadedTransactions.concat(await loadTransactions(account, newTransactions));
    }
    next = response.links.next;
  }
  return loadedTransactions;
}

/**
 * for aggregate transactions, we don't care about multi-hop token transfers that zero out
 */
function removeMultiHopTokenTransfers(aggregate: RawLoadedTransaction) {
  const tokenTransferAmountByAccountToken = new Map<string, LoadedTokenTransfer>();
  aggregate.tokenTransfers.forEach((t) => {
    const key = `${t.account}:${t.tokenId}`;
    const current = tokenTransferAmountByAccountToken.get(key);
    if (!current) {
      tokenTransferAmountByAccountToken.set(key, t);
    } else {
      current.decimalAmount += t.decimalAmount;
    }
  });
  aggregate.tokenTransfers = Array.from(tokenTransferAmountByAccountToken.entries())
    .map(([_, v]) => v)
    .filter((v) => v.decimalAmount !== 0);
}
/**
 *  combines transactions with the same transaction id, e.g. contract calls
 *  this function mutates the underlying transactions for performance
 */
function aggregateSmartContractTransactions(loadedTransactions: RawLoadedTransaction[]): RawLoadedTransaction[] {
  let aggregatedTransactions: RawLoadedTransaction[] = [];
  let currentAggregate: RawLoadedTransaction | null = null;
  loadedTransactions.forEach((t) => {
    if (!currentAggregate) {
      currentAggregate = t;
      return;
    }

    if (currentAggregate.transactionId !== t.transactionId) {
      if (currentAggregate._aggregated) {
        removeMultiHopTokenTransfers(currentAggregate);
      }
      aggregatedTransactions.push(currentAggregate);
      currentAggregate = t;
      return;
    }

    console.info(`dealing with smart contract: ${currentAggregate.transactionId}`);
    currentAggregate._aggregated = true;
    currentAggregate.hbarFromAccount = [
      ...currentAggregate.hbarFromAccount,
      ...t.hbarFromAccount.filter((a) => !currentAggregate.hbarFromAccount.includes(a)),
    ];
    currentAggregate.hbarToAccount = [
      ...currentAggregate.hbarToAccount,
      ...t.hbarToAccount.filter((a) => !currentAggregate.hbarToAccount.includes(a)),
    ];
    currentAggregate.hbarTransfer += t.hbarTransfer;
    currentAggregate.stakingReward += t.stakingReward;
    currentAggregate.nftTransfers = [...currentAggregate.nftTransfers, ...t.nftTransfers];
    currentAggregate.tokenTransfers = [...currentAggregate.tokenTransfers, ...t.tokenTransfers];
    currentAggregate.memo = [currentAggregate.memo, t.memo].filter((m) => m).join(", ");
  });

  if (currentAggregate) {
    aggregatedTransactions.push(currentAggregate);
  }

  return aggregatedTransactions;
}

/**
 * This splits apart transactions involving multiple NFTs so we can attribute crypto transfers to each serial. A simple average is used for attribution
 */
function splitMultiNftTransferTransactions(loadedTransactions: RawLoadedTransaction[]): LoadedTransaction[] {
  return loadedTransactions
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
    .flat();
}

program
  .description("Load transactions from the mirror")
  .argument("<account>", "The account to fetch data for")
  .argument("<year>", "The tax year to fetch data for", (y) => parseInt(y, 10))
  .option(
    "-s, --sourceFile <string>",
    "A source file or directory to use for transactions. This should be a full path to all-transactions.json or a directory containing this file from previous run. This will fine the most recent all-transactions if you don't specify the full path."
  )
  .option("-p, --previous", "Use the previous output as the source file. This is easier to use than specifying the source file explicitly")
  .option("-o, --overrideDataStart <string>", "Override the start date, ISO string", (d) => new Date(d))
  .action(async (account: string, year: number, options: Partial<{ sourceFile: string; previous: boolean; overrideDataStart: Date }>) => {
    const reportStartDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const reportEndDate = new Date(`${year}-12-31T23:59:59.999Z`);
    const dataStartDate = options.overrideDataStart ?? new Date(`${year - 2}-01-01T00:00:00.000Z`);
    let sourceFile = options.previous ? getRunDir(year, account) : options.sourceFile;
    console.info("Running tax-report", { sourceFile, reportStartDate, reportEndDate, dataStartDate });
    try {
      const endTimestamp = dateToHederaTs(reportEndDate, true);

      let rawLoadedTransactions: RawLoadedTransaction[] = await loadAllTransactions(account, dataStartDate, endTimestamp, sourceFile);
      // loaded transactions are mutated during processing, so write them to disc first
      const directories = await prepareOutDirectories(year, rawLoadedTransactions, account);

      const transactionsByToken: Record<string, LoadedTransaction[]> = {};
      const transactionsByNft: Record<string, Record<number, LoadedTransaction[]>> = {};
      rawLoadedTransactions = aggregateSmartContractTransactions(rawLoadedTransactions);
      const loadedTransactions = splitMultiNftTransferTransactions(rawLoadedTransactions);

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
          t.tokenTransfers.forEach((t1) => (transactionsByToken[t1.tokenId] = [...(transactionsByToken[t1.tokenId] ?? []), t]));
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
          tokenSymbol: transactions[0].tokenTransfers.find((t) => t.tokenId === tokenId).tokenSymbol,
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
            tokenSymbol: transactions.find((n) => n.nftTransfer)?.nftTransfer.tokenSymbol ?? "unknown",
          }))
        )
        .filter(({ tokenId, serialNumber, transactions }) =>
          transactions.filter(isInTaxYear).find(
            (t1) =>
              // Did we send an NFT and did we get paid for it?
              t1.nftTransfer &&
              t1.nftTransfer.tokenId === tokenId &&
              t1.nftTransfer.serialNumber === serialNumber &&
              t1.nftTransfer.senderAccount === account &&
              t1.hbarTransfer > 1
          )
        );

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
      console.error(e);
      process.exit(1);
    }
  });

program.parse();
