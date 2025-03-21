export function assertExistence<T>(test: T | undefined | null, message?: string): asserts test is T {
  if (test === null || test === undefined) {
    throw new Error(`Assert existence error: ${message ?? test}`);
  }
}

export function requireExistence<T>(test: T | undefined | null, message?: string): T {
  assertExistence(test, message);

  return test;
}

export const re = requireExistence;
