import { MirrorResponse } from "lworks-client";

export type Transaction = MirrorResponse.Schemas["Transaction"];
export type TransactionsResponse = MirrorResponse.Schemas["TransactionsResponse"];
export type TransactionByIdResponse = MirrorResponse.Schemas["TransactionByIdResponse"];
export type TokenInfo = MirrorResponse.Schemas["TokenInfo"];
export type ExchangeRateResponse = MirrorResponse.Schemas["NetworkExchangeRateSetResponse"];
export type ExchangeRate = MirrorResponse.Schemas["ExchangeRate"];

export type LoadedTokenTransfer = {
  tokenId: string;
  account: string;
  decimalAmount: number;
  tokenName: string;
  tokenSymbol: string;
  exchangeRate: number | null;
};
export type LoadedNftTransfer = {
  tokenId: string;
  serialNumber: number;
  receiverAccount: string;
  senderAccount: string | undefined | null;
  tokenName: string;
  tokenSymbol: string;
  hbarAttribution: number;
};
export type RawLoadedTransaction = {
  transactionId: string;
  timestamp: Date;
  memo: string;
  hbarToAccount: string[];
  hbarFromAccount: string[];
  hbarTransfer: number;
  stakingReward: number;
  exchangeRate: number;
  tokenTransfers: LoadedTokenTransfer[];
  nftTransfers: LoadedNftTransfer[];
  consensusTimestamp: string;
  _aggregated?: boolean;
  _splitNfts?: boolean;
  _attributedNft?: string;
};

/**
 * The result of splitting transactions per NFT. This is beneficial for bulk NFT purchases or sales. This does get funky for NFT to NFT trades with supplemental HBAR.
 */
export type SplitNftLoadedTransaction = Omit<RawLoadedTransaction, "nftTransfers"> & {
  nftTransfer: LoadedNftTransfer | undefined;
};

/**
 * The end result of transforming transaction data
 */
export type LoadedTransaction = SplitNftLoadedTransaction;
