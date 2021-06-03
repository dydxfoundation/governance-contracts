pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SP1Storage} from './SP1Storage.sol';

/**
 * @title SP1Getters
 * @author dYdX
 *
 * @notice Simple getter functions.
 */
abstract contract SP1Getters is SP1Storage {
  // ============ External Functions ============

  /**
   * @notice Check whether a STARK key is allowed for exchange operations.
   *
   * @param  starkKey  The STARK key to check.
   *
   * @return Boolean `true` if the STARK key is allowed, otherwise `false`.
   */
  function isAllowedStarkKey(uint256 starkKey) external view returns (bool) {
    return _ALLOWED_STARK_KEYS_[starkKey];
  }

  /**
   * @notice Check whether a recipient is allowed for withdrawals from the proxy.
   *
   * @param  recipient  The recipient address to check.
   *
   * @return Boolean `true` if the recipient is allowed, otherwise `false`.
   */
  function isAllowedRecipient(address recipient) external view returns (bool) {
    return _ALLOWED_RECIPIENTS_[recipient];
  }

  /**
   * @notice Check whether borrowing has been restricted by the proxy guardian.
   *  Note that this is different from borrowing restrictions set in LiquidityStakingV1.
   *
   * @return Boolean `true` if borrowing is restricted, otherwise `false`.
   */
  function isBorrowingRestricted() external view returns (bool) {
    return _IS_BORROWING_RESTRICTED_;
  }
}
