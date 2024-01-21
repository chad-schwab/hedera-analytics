import { writeFile } from "node:fs";

import { stringify } from "csv-stringify";

import { createLogger } from "../../logger";
import { LoadedTokenTransfer, LoadedTransaction } from "../types";

const logger = createLogger("write-csv");

type ColumnTokenStrategy = { strategy: "column"; allTokens: { tokenId: string; tokenSymbol: string }[]; targetTokenId?: string };
export type TokenStrategy = { strategy: "omit" } | { strategy: "join" } | ColumnTokenStrategy;
export type NftStrategy = { strategy: "omit" } | { strategy: "include" };
export type MetaStrategy = { strategy: "omit" } | { strategy: "include" };
export type StakingRewardStrategy = { strategy: "omit" } | { strategy: "include" };

type CsvOptions = Partial<{
  tokenStrategy: TokenStrategy;
  nftStrategy: NftStrategy;
  stakingStrategy: StakingRewardStrategy;
  metaStrategy: MetaStrategy;
}>;

function handleColumnStrategy(tokenStrategy: ColumnTokenStrategy, tokenTransfers: LoadedTokenTransfer[]) {
  let { allTokens } = tokenStrategy;
  if (tokenStrategy.targetTokenId) {
    const foundTargetToken = allTokens.find((t) => t.tokenId === tokenStrategy.targetTokenId);
    if (foundTargetToken) {
      allTokens = [foundTargetToken, ...allTokens.filter((t) => t.tokenId !== tokenStrategy.targetTokenId)];
    }
  }
  return allTokens.reduce((agg, token) => {
    const currentTokenTransfers = tokenTransfers.find((t) => t.tokenId === token.tokenId);
    return {
      ...agg,
      [`${token.tokenSymbol}:${token.tokenId} G/L`]: currentTokenTransfers?.decimalAmount,
      [`${token.tokenSymbol}:${token.tokenId} Exchange Rate`]: currentTokenTransfers?.exchangeRate ?? "",
      [`${token.tokenSymbol}:${token.tokenId} G/L (USD)`]: currentTokenTransfers?.exchangeRate
        ? currentTokenTransfers.decimalAmount * currentTokenTransfers.exchangeRate
        : "",
    };
  }, {});
}

function writeStakingRewardColumns(stakingStrategy: StakingRewardStrategy, i: LoadedTransaction) {
  return stakingStrategy.strategy === "omit"
    ? undefined
    : { "Hbar Staking Reward": i.stakingReward, "Staking Reward (USD)": i.stakingReward * i.exchangeRate };
}

function writeFungibleTokenColumns(tokenStrategy: TokenStrategy, tokenTransfers: LoadedTokenTransfer[]) {
  const { strategy } = tokenStrategy;
  switch (strategy) {
    case "omit":
      return undefined;
    case "join":
      return {
        "Token ID": tokenTransfers.map((t) => t.tokenId).join(", "),
        "Token Name": tokenTransfers.map((t) => t.tokenName).join(", "),
        "Token Symbol": tokenTransfers.map((t) => t.tokenSymbol).join(", "),
        "Token G/L": tokenTransfers.map((t) => t.decimalAmount).join(", "),
        "Token Exchange Rate": tokenTransfers.map((t) => t.exchangeRate ?? "").join(", "),
        "Token G/L (USD)": tokenTransfers.map((t) => (t.exchangeRate === null ? "" : t.decimalAmount * t.exchangeRate)).join(", "),
      };
    case "column":
      return handleColumnStrategy(tokenStrategy, tokenTransfers);
    default:
      throw new Error(`Unhandled token strategy: ${strategy}`);
  }
}

function writeNftColumns(nftStrategy: NftStrategy, i: LoadedTransaction, accountId: string) {
  return nftStrategy.strategy === "omit"
    ? undefined
    : {
        "NFT Token ID": i.nftTransfer?.tokenId || i._attributedNft?.split(":")?.at(0),
        Serial: i.nftTransfer?.serialNumber || i._attributedNft?.split(":")?.at(1),
        NFT: i.nftTransfer ? `${i.nftTransfer.tokenId}:${i.nftTransfer.serialNumber}` : i._attributedNft,
        "NFT Name": i.nftTransfer?.tokenName,
        "NFT Symbol": i.nftTransfer?.tokenSymbol,
        "NFT Sold?": i.nftTransfer?.senderAccount === accountId,
      };
}

function writeMetaColumns(metaStrategy: MetaStrategy, i: LoadedTransaction) {
  return metaStrategy.strategy === "omit"
    ? undefined
    : {
        multiTokenTransaction: i._splitNfts || Number(Boolean(i.nftTransfer)) + i.tokenTransfers.length > 1,
        exchangeRate: i.exchangeRate,
        aggregated: i._aggregated ?? false,
        splitNfts: i._splitNfts ?? false,
      };
}

export function writeCsv(
  accountId: string,
  transactions: LoadedTransaction[],
  fileName: string,
  {
    tokenStrategy = { strategy: "join" },
    nftStrategy = { strategy: "include" },
    stakingStrategy = { strategy: "include" },
    metaStrategy = { strategy: "omit" },
  }: CsvOptions = {}
): Promise<void> {
  const transformedItems = transactions.map((i) => {
    const { transactionId } = i;
    const usd = i.hbarTransfer * i.exchangeRate;
    return {
      Year: i.timestamp.getFullYear(),
      Date: i.timestamp.toLocaleString().replaceAll(",", ""),
      Memo: i.memo.replaceAll("\n", ""),
      "Hbar G/L": i.hbarTransfer,
      "Sales Proceed (USD)": usd > 0 ? usd : 0,
      "Cost Basis (USD)": usd < 0 ? usd : 0,
      "G/L (USD)": usd,
      ...writeStakingRewardColumns(stakingStrategy, i),
      "Hbar From Accounts": i.hbarFromAccount.join(","),
      "Hbar To Accounts": i.hbarToAccount.join(","),
      ...writeFungibleTokenColumns(tokenStrategy, i.tokenTransfers),
      ...writeNftColumns(nftStrategy, i, accountId),
      explore: `https://explore.lworks.io/mainnet/transactions/${transactionId}`,
      ...writeMetaColumns(metaStrategy, i),
      UTC: i.timestamp.toISOString(),
    };
  });

  return new Promise((res, rej) => {
    stringify(transformedItems, { header: true, cast: { boolean: (v: boolean) => String(v) } }, (e, output) => {
      if (e) {
        console.error("Error writing CSV: ", fileName);
        rej(e);
      }
      writeFile(fileName, output, (err) => {
        if (err) {
          rej(err);
          return;
        }
        logger.info(fileName);
        res();
      });
    });
  });
}
