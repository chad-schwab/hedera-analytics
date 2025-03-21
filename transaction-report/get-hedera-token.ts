import { callMirror } from "lworks-client";

import { TokenInfo } from "./types";
import { FileCacheMemo } from "./file-cache-memo";

const fileCacheMemo = FileCacheMemo((tokenId) => callMirror<TokenInfo>(`/api/v1/tokens/${tokenId}`), {
  basePath: "./.cache",
  ns: "token-by-id",
});

export const getHederaToken = fileCacheMemo.get;
