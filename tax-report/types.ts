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

export type LoadedTransaction = Omit<RawLoadedTransaction, "nftTransfers"> & {
  nftTransfer: LoadedNftTransfer | undefined;
};
