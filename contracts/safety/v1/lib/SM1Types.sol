pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

library SM1Types {
  /**
   * @dev The parameters used to convert a timestamp to an epoch number.
   */
  struct EpochParameters {
    uint128 interval;
    uint128 offset;
  }

  /**
   * @dev A balance, possibly with a change scheduled for the next epoch.
   *
   * @param  currentEpoch         The epoch in which the balance was last updated.
   * @param  currentEpochBalance  The balance at epoch `currentEpoch`.
   * @param  nextEpochBalance     The balance at epoch `currentEpoch + 1`.
   * @param  fullSlashCounter     Counter indicating whether any full slashes need to be applied.
   */
  struct StoredBalance {
    uint16 currentEpoch;
    uint112 currentEpochBalance;
    uint112 nextEpochBalance;
    uint16 fullSlashCounter;
  }

  /**
   * @dev Information about a full slash. A full slash sets all balances to zero and resets the
   *  exchange rate.
   */
  struct FullSlash {
    uint128 epoch;
    uint128 rewardsGlobalIndex;
  }
}
