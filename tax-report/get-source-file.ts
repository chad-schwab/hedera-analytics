import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import invariant from "tiny-invariant";

import { createLogger } from "../logger";

import { archiveFileName, getOutputBase } from "./prepare-out-directory";

const logger = createLogger("get-source-file");

type FileInfo = {
  filePath: string;
  modifiedTime: number;
};
// eslint-disable-next-line sonarjs/cognitive-complexity
function findLastModifiedFileByName(directory: string, fileName: string): string | null {
  let lastModified: FileInfo | null = null;
  const files = readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      const nestedFile = findLastModifiedFileByName(filePath, fileName);

      if (nestedFile) {
        const modifiedTime = statSync(nestedFile).mtimeMs;

        if (!lastModified || modifiedTime > lastModified.modifiedTime) {
          lastModified = { filePath: nestedFile, modifiedTime };
        }
      }
    } else if (file === fileName) {
      const modifiedTime = stat.mtimeMs;

      if (!lastModified || modifiedTime > lastModified.modifiedTime) {
        lastModified = { filePath, modifiedTime };
      }
    }
  }

  return lastModified ? lastModified.filePath : null;
}
export function getSourceFile(year: number, account: string, options: Partial<{ sourcePath: string; previousOutput: boolean }>) {
  let sourceFile: string | null = null;
  if (options.previousOutput || options.sourcePath) {
    const sourcePath = options.previousOutput ? getOutputBase(year, account) : options.sourcePath;
    invariant(sourcePath);
    if (sourcePath.endsWith(archiveFileName)) {
      sourceFile = sourcePath;
    } else {
      sourceFile = findLastModifiedFileByName(sourcePath, archiveFileName);
      if (!sourcePath) {
        throw new Error(`Unable to find deeply nested ${archiveFileName} in directory: ${sourcePath}`);
      }
      logger.info(`Using source file: ${sourcePath}`);
    }
  }
  return sourceFile;
}
