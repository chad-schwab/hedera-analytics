import { callMirror } from "lworks-client";

import { TokenInfo } from "./types";
import { FileCacheMemo } from "./file-cache-memo";

const fileCacheMemo = FileCacheMemo((tokenId) => callMirror<TokenInfo>(`/api/v1/tokens/${tokenId}`), {
  basePath: "./.cache", // (optional) Path where cache files are stored (default).
  ns: "token-by-id", // (optional) A grouping namespace for items.
});

export const getHederaToken = fileCacheMemo.get;
