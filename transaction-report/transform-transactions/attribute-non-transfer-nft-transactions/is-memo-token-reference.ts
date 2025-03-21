import memoize from "fast-memoize";

function tokenMemoPattern(tokenId: string) {
  return new RegExp(`[^\\d]${tokenId}[^\\d]`);
}

const getTokenMemoPattern = memoize(tokenMemoPattern);

export const isMemoTokenReference = (memo: string, tokenId: string) => {
  return Boolean(memo.match(getTokenMemoPattern(tokenId)));
};
