import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseDir = path.join(__dirname, "..", "output", "tax-report");

export function getOutputBase(year: number, account: string): string {
  return path.join(baseDir, year.toString(), account);
}

export async function prepareOutDirectories(year: number, account: string) {
  const outputDir = getOutputBase(year, account);
  const allTimeDir = path.join(outputDir, "all-time");
  const soldTokensDir = path.join(outputDir, "sold-tokens");
  const soldNftsDir = path.join(outputDir, "sold-nfts");

  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await mkdir(allTimeDir).catch(() => {});
  await mkdir(soldTokensDir).catch(() => {});
  await mkdir(soldNftsDir).catch(() => {});
  return { outputDir, allTimeDir, soldTokensDir, soldNftsDir };
}
