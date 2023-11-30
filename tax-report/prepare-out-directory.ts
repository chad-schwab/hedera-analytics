import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { RawLoadedTransaction } from "./types";

const baseDir = path.join(__dirname, "..", "output", "tax-report");

export const archiveFileName = "transaction-archive.json";

export function getOutputBase(year: number, account: string): string {
  return path.join(baseDir, year.toString(), account);
}

export async function prepareOutDirectories(year: number, archiveContents: RawLoadedTransaction[], account: string) {
  const outputDir = path.join(getOutputBase(year, account), new Date().toISOString());
  const allTimeDir = path.join(outputDir, "all-time");
  const soldTokensDir = path.join(outputDir, "sold-tokens");
  const soldNftsDir = path.join(outputDir, "sold-nfts");
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(allTimeDir);
  mkdirSync(soldTokensDir);
  mkdirSync(soldNftsDir);
  writeFileSync(path.join(outputDir, archiveFileName), JSON.stringify(archiveContents, null, 2));
  return { outputDir, allTimeDir, soldTokensDir, soldNftsDir };
}
