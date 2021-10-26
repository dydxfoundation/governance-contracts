// Based on https://github.com/Uniswap/merkle-distributor/blob/c3255bfa2b684594ecd562cacd7664b0f18330bf/src/balance-tree.ts

import { BigNumber, BigNumberish, utils } from 'ethers';
import _ from 'lodash';

import MerkleTree from './merkle-tree';

export default class BalanceTree extends MerkleTree {

  constructor(
    balances: { [account: string]: BigNumberish },
  ) {
    super(
      _.map(balances, (amount, account) => {
        return BalanceTree.toNode(account, amount);
      }),
    );
  }

  static verifyProof(
    account: string,
    amount: BigNumberish,
    proof: Buffer[],
    root: Buffer,
  ): boolean {
    let pair = BalanceTree.toNode(account, amount);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }
    return pair.equals(root);
  }

  static toNode(
    account: string,
    amount: BigNumberish,
  ): Buffer {
    const amountBN = BigNumber.from(amount);
    return Buffer.from(
      // Equivalent to keccak256(abi.encodePacked(account, amount))
      utils.solidityKeccak256(['address', 'uint256'], [account, amountBN]).substr(2),
      'hex',
    );
  }

  /**
   * @notice Returns the hex bytes32 values of the proof.
   */
  getProof(account: string, amount: BigNumberish): Buffer[] {
    return this._getProof(BalanceTree.toNode(account, amount));
  }

  /**
   * @notice Returns the hex bytes32 values of the proof.
   */
  getHexProof(account: string, amount: BigNumberish): string[] {
    return this._getHexProof(BalanceTree.toNode(account, amount));
  }
}
