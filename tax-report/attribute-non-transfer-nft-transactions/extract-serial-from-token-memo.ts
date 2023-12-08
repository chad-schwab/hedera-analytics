import memoize from "fast-memoize";

import { TokenLoadedTransaction } from "../types";

function serialMemoPattern(tokenId: string) {
  return new RegExp(`|${tokenId}.(\\d+)`);
}

const getTokenSerialPattern = memoize(serialMemoPattern);

export function extractSerialFromTokenMemo(t: TokenLoadedTransaction, foundTokenId: string) {
  const serialNumberMatch =
    t.memo.match(/serial number (\d+) /i) || t.memo.match(/serial (\d+) /i) || t.memo.match(getTokenSerialPattern(foundTokenId));

  if (serialNumberMatch) {
    return parseInt(serialNumberMatch[1], 10);
  }

  return null;
}
