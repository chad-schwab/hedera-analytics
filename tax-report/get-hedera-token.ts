import { callMirror } from "lworks-client";
import { TokenInfo } from "./types";

export const tokenRequestCache = new Map<string, Promise<TokenInfo>>();

export async function getHederaToken(tokenId: string) {
  if (!tokenRequestCache.has(tokenId)) {
    tokenRequestCache.set(tokenId, callMirror<TokenInfo>(`/api/v1/tokens/${tokenId}`));
  }
  return tokenRequestCache[tokenId];
}
