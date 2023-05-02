import BNJS from 'bignumber.js';
import { ContractTransaction } from 'ethers';
import Web3 from 'web3';

import { BigNumberable, Role } from '../types';

export function getRole(
  role: Role,
): string {
  return Web3.utils.soliditySha3(role)!;
}

export function toWad(
  value: BigNumberable,
): string {
  return new BNJS(value).shiftedBy(18).toFixed();
}

export async function waitForTx(
  tx: ContractTransaction,
) {
  return tx.wait(1);
}