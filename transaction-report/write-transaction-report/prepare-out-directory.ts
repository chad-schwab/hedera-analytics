import { mkdir, rmdir } from "node:fs/promises";
import path from "node:path";

const baseDir = path.join(__dirname, "..", "output", "transaction-report");

export function getOutputBase(year: number, account: string): string {
  return path.join(baseDir, year.toString(), account, new Date().toISOString().slice(0, 10));
}

export async function prepareOutDirectories(year: number, account: string) {
  const outputDir = getOutputBase(year, account);
  const allTimeDir = path.join(outputDir, "all-time");
  const soldTokensDir = path.join(outputDir, "sold-tokens");
  const soldNftsDir = path.join(outputDir, "sold-nfts");

  await rmdir(outputDir, { recursive: true }).catch(() => {});
  await mkdir(outputDir, { recursive: true });
  await mkdir(allTimeDir);
  await mkdir(soldTokensDir);
  await mkdir(soldNftsDir);
  return { outputDir, allTimeDir, soldTokensDir, soldNftsDir };
}
