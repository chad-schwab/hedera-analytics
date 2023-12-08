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
};
export type LoadedNftTransfer = {
  tokenId: string;
  serialNumber: number;
  receiverAccount: string;
  senderAccount: string;
  tokenName: string;
  tokenSymbol: string;
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

export type TokenLoadedTransaction = Omit<RawLoadedTransaction, "tokenTransfers" | "nftTransfers"> & {
  nftTransfer: LoadedNftTransfer | undefined;
  tokenTransfers: Array<LoadedTokenTransfer & { exchangeRate: number }>;
};
