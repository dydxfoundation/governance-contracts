import { TransactionReceipt } from '@ethersproject/abstract-provider';

import { EthereumTransactionTypeExtended } from '../../src';
import { SignerWithAddress } from './make-suite';

export async function sendTransactions(
  txs: EthereumTransactionTypeExtended[],
  signer: SignerWithAddress,
): Promise<TransactionReceipt[]> {
  const receipts: TransactionReceipt[] = [];
  for (const tx of txs) {
    const txRequest = await tx.tx();
    const txResponse = await signer.signer.sendTransaction(txRequest);
    const txReceipt = await txResponse.wait();
    receipts.push(txReceipt);
  }
  return receipts;
};
