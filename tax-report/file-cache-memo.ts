import Cache from "file-system-cache";
import memo from "fast-memoize";

export function FileCacheMemo<T>(loader: (key: string) => Promise<T>, ...params: Parameters<typeof Cache>) {
  const fileCache = Cache(...params);

  return {
    get: memo(async (key: string) => {
      const fileContents: T = await fileCache.get(key, null);

      if (fileContents) {
        return fileContents;
      }

      const result = await loader(key);
      await fileCache.set(key, result);
      return result;
    }),
  };
}
