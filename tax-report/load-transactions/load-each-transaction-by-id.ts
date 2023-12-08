import { AccountId } from "@hashgraph/sdk";
import { callMirror } from "lworks-client";

import { createLogger } from "../../logger";
import { getHederaExchangeRate } from "../get-hedera-exchange-rate";
import { getHederaToken } from "../get-hedera-token";
import { hederaTsToDate, tinyToHbar } from "../hedera-utils";
import { LoadedNftTransfer, LoadedTokenTransfer, RawLoadedTransaction, Transaction, TransactionByIdResponse } from "../types";
import { requireExistence as re } from "../existence-util";

const logger = createLogger("load-each-transaction");

/**
 * The transactions query endpoint does not include nft transfers, so we load them here. Further, we format the response in an object that is easier to work with than the api object.
 * This also filters token and nft transfers to only include those involving the account we are loading for.
 * @param accountId
 * @param transactions
 * @returns
 */
export async function loadEachTransactionById(accountId: string, transactions: Transaction[]): Promise<RawLoadedTransaction[]> {
  return Promise.all(
    transactions.map(async (transaction) => {
      let tokenTransfers: LoadedTokenTransfer[] = [];
      let nftTransfers: LoadedNftTransfer[] = [];
      const memo = Buffer.from(transaction.memo_base64 ?? "", "base64").toString();
      if (transaction.token_transfers?.length) {
        const tokenInfos = await Promise.all(transaction.token_transfers.map((t) => getHederaToken(re(t.token_id))));

        tokenTransfers = transaction.token_transfers.map((t, i) => {
          const tokenInfo = tokenInfos[i];
          if (!tokenInfo) {
            logger.info(tokenInfos);
            throw new Error(`Failed to load token from mirror: ${transaction.token_transfers?.[i].token_id}`);
          }

          return {
            tokenId: re(tokenInfo.token_id),
            tokenName: re(tokenInfo.name),
            tokenSymbol: re(tokenInfo.symbol),
            account: re(t.account),
            decimalAmount: tokenInfo.decimals ? t.amount / 10 ** parseInt(tokenInfo.decimals, 10) : t.amount,
          };
        });
      }
      const response = await callMirror<TransactionByIdResponse>(`/api/v1/transactions/${transaction.transaction_id}`);
      const transactionNftTransfers = response.transactions?.filter((t) => t.nft_transfers?.length).flatMap((t) => re(t.nft_transfers));
      if (transactionNftTransfers?.length) {
        const tokenInfos = await Promise.all(transactionNftTransfers.map((t) => getHederaToken(re(t.token_id))));

        nftTransfers = transactionNftTransfers.map((t, i) => {
          const tokenInfo = tokenInfos[i];
          return {
            tokenId: re(tokenInfo.token_id),
            serialNumber: t.serial_number,
            tokenName: re(tokenInfo.name),
            tokenSymbol: re(tokenInfo.symbol),
            senderAccount: re(t.sender_account_id),
            receiverAccount: re(t.receiver_account_id),
          };
        });
      }
      const stakingReward = transaction.staking_reward_transfers?.find((s) => s.account === accountId)?.amount ?? 0;
      const transfer = transaction.transfers?.find((a) => a.account === accountId)?.amount ?? 0;
      const netTransfer = transfer - stakingReward;
      return {
        transactionId: re(transaction.transaction_id),
        timestamp: hederaTsToDate(re(transaction.consensus_timestamp)),
        hbarToAccount: re(transaction.transfers)
          .filter((t) => t.amount > 0 && AccountId.fromString(re(t.account)).num.gt(999))
          .map((t) => re(t.account)),
        hbarFromAccount: re(transaction.transfers)
          .filter((t) => t.amount < 0 && AccountId.fromString(re(t.account)).num.gt(999))
          .map((t) => re(t.account)),
        hbarTransfer: tinyToHbar(netTransfer),
        stakingReward: tinyToHbar(stakingReward),
        memo,
        exchangeRate: await getHederaExchangeRate(hederaTsToDate(re(transaction.consensus_timestamp))),
        tokenTransfers: tokenTransfers.filter((t) => t.account === accountId),
        nftTransfers: nftTransfers.filter((t) => t.senderAccount === accountId || t.receiverAccount === accountId),
        consensusTimestamp: re(transaction.consensus_timestamp),
      } satisfies RawLoadedTransaction;
    })
  );
}
