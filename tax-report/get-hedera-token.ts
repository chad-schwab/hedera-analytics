import { callMirror } from "lworks-client";
import memoize from "fast-memoize";

import { createLogger } from "../logger";

import { TokenInfo } from "./types";

const logger = createLogger("get-hedera-token");

function loadMirrorToken(tokenId: string): Promise<TokenInfo> {
  return callMirror<TokenInfo>(`/api/v1/tokens/${tokenId}`).catch((e) => {
    logger.info(e, `Error calling mirror tokens endpoint for token with id: ${tokenId}`);
    throw e;
  });
}

export const getHederaToken = memoize(loadMirrorToken);
