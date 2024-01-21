import { AccountId } from "@hashgraph/sdk";
import { callMirror } from "lworks-client";

import { createLogger } from "../../logger";
import { requireExistence as re } from "../existence-util";
import { getHederaExchangeRate } from "../get-hedera-exchange-rate";
import { getHederaToken } from "../get-hedera-token";
import { hederaTsToDate } from "../hedera-utils";
import { LoadedNftTransfer, LoadedTokenTransfer, RawLoadedTransaction, Transaction, TransactionByIdResponse } from "../types";
import { getSaucerExchangeRate } from "../get-saucer-exchange-rate";

import { calculateHbarGL } from "./calculate-hbar-gl";
import { calculateNftHbarAttributions } from "./calculate-nft-hbar-attribution";

export const logger = createLogger("load-each-transaction");

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
      let tokenTransfers: Omit<LoadedTokenTransfer, "exchangeRate">[] = [];
      let nftTransfers: LoadedNftTransfer[] = [];
      const memo = Buffer.from(transaction.memo_base64 ?? "", "base64").toString();
      const { netTransfer, stakingReward } = calculateHbarGL(transaction, accountId);

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
      const transactionWithNftTransfers = re(
        response.transactions?.find((t) => t.consensus_timestamp === transaction.consensus_timestamp),
        `We should get a transaction matching ${transaction.transaction_id} at ${transaction.consensus_timestamp} from the mirror.`
      );
      const transactionNftTransfers = transactionWithNftTransfers.nft_transfers;
      if (transactionNftTransfers?.length) {
        const tokenInfos = await Promise.all(transactionNftTransfers.map((t) => getHederaToken(re(t.token_id))));

        const nftTransferHbarAttribution = calculateNftHbarAttributions(transactionWithNftTransfers, netTransfer);
        nftTransfers = transactionNftTransfers.map((t, i): LoadedNftTransfer => {
          const tokenInfo = tokenInfos[i];
          return {
            tokenId: re(tokenInfo.token_id),
            serialNumber: t.serial_number,
            tokenName: re(tokenInfo.name),
            tokenSymbol: re(tokenInfo.symbol),
            senderAccount: t.sender_account_id,
            receiverAccount: re(t.receiver_account_id),
            hbarAttribution: nftTransferHbarAttribution[i],
          };
        });
      }
      return {
        transactionId: re(transaction.transaction_id),
        timestamp: hederaTsToDate(re(transaction.consensus_timestamp)),
        hbarToAccount: re(transaction.transfers)
          .filter((t) => t.amount > 0 && AccountId.fromString(re(t.account)).num.gt(999))
          .map((t) => re(t.account)),
        hbarFromAccount: re(transaction.transfers)
          .filter((t) => t.amount < 0 && AccountId.fromString(re(t.account)).num.gt(999))
          .map((t) => re(t.account)),
        hbarTransfer: netTransfer,
        stakingReward,
        memo,
        exchangeRate: await getHederaExchangeRate(hederaTsToDate(re(transaction.consensus_timestamp))),
        tokenTransfers: await Promise.all(
          tokenTransfers
            .filter((t) => t.account === accountId)
            .map(async (t) => ({
              ...t,
              exchangeRate: await getSaucerExchangeRate(t.tokenId, hederaTsToDate(re(transaction.consensus_timestamp))),
            }))
        ),
        nftTransfers: nftTransfers.filter((t) => t.senderAccount === accountId || t.receiverAccount === accountId),
        consensusTimestamp: re(transaction.consensus_timestamp),
      } satisfies RawLoadedTransaction;
    })
  );
}
