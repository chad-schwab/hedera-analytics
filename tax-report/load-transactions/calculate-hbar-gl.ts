import { tinyToHbar } from "../hedera-utils";
import { Transaction } from "../types";

/**
 * Calculates the net transfer and staking reward in hbars for a given transaction and account ID.
 * @param transaction - The transaction object.
 * @param accountId - The account ID.
 * @returns An object containing the net transfer and staking reward in hbars.
 */
export function calculateHbarGL(transaction: Transaction, accountId: string) {
  const stakingReward = transaction.staking_reward_transfers?.find((s) => s.account === accountId)?.amount ?? 0;
  const transfer = transaction.transfers?.find((a) => a.account === accountId)?.amount ?? 0;
  const netTransfer = transfer - stakingReward;
  return { netTransfer: tinyToHbar(netTransfer), stakingReward: tinyToHbar(stakingReward) };
}
