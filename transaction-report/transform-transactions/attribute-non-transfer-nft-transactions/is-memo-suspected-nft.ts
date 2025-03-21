const nftMemoPattern = / nft[: ]/i;

export const isMemoSuspectedNft = (memo: string) => {
  return memo.match(nftMemoPattern);
};
