export function getAggregatedAccountId(allAccounts: string[]) {
  return allAccounts.sort().join(":");
}
