// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

library SM1Types {
  /**
   * @dev The parameters used to convert a timestamp to an epoch number.
   */
  struct EpochParameters {
    uint128 interval;
    uint128 offset;
  }

  /**
   * @dev Snapshot of a value at a specific block, used to track historical governance power.
   */
  struct Snapshot {
    uint256 blockNumber;
    uint256 value;
  }

  /**
   * @dev A balance, possibly with a change scheduled for the next epoch.
   *
   * @param  currentEpoch         The epoch in which the balance was last updated.
   * @param  currentEpochBalance  The balance at epoch `currentEpoch`.
   * @param  nextEpochBalance     The balance at epoch `currentEpoch + 1`.
   */
  struct StoredBalance {
    uint16 currentEpoch;
    uint240 currentEpochBalance;
    uint240 nextEpochBalance;
  }
}
