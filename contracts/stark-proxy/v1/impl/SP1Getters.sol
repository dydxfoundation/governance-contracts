// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { Math } from '../../../utils/Math.sol';
import { SP1Storage } from './SP1Storage.sol';

/**
 * @title SP1Getters
 * @author dYdX
 *
 * @dev Simple external getter functions.
 */
abstract contract SP1Getters is
  SP1Storage
{
  using SafeMath for uint256;

  // ============ External Functions ============

  /**
   * @notice Check whether a STARK key is on the allowlist for exchange operations.
   *
   * @param  starkKey  The STARK key to check.
   *
   * @return Boolean `true` if the STARK key is allowed, otherwise `false`.
   */
  function isStarkKeyAllowed(
    uint256 starkKey
  )
    external
    view
    returns (bool)
  {
    return _ALLOWED_STARK_KEYS_[starkKey];
  }

  /**
   * @notice Check whether a recipient is on the allowlist to receive withdrawals.
   *
   * @param  recipient  The recipient to check.
   *
   * @return Boolean `true` if the recipient is allowed, otherwise `false`.
   */
  function isRecipientAllowed(
    address recipient
  )
    external
    view
    returns (bool)
  {
    return _ALLOWED_RECIPIENTS_[recipient];
  }

  /**
   * @notice Get the amount approved by the guardian for external withdrawals.
   *  Note that withdrawals are always permitted if the amount is in excess of the borrowed amount.
   *
   * @return The amount approved for external withdrawals.
   */
  function getApprovedAmountForExternalWithdrawal()
    external
    view
    returns (uint256)
  {
    return _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_;
  }

  /**
   * @notice Check whether this borrower contract is restricted from new borrowing, as well as
   *  restricted from depositing borrowed funds to the exchange.
   *
   * @return Boolean `true` if the borrower is restricted, otherwise `false`.
   */
  function isBorrowingRestricted()
    external
    view
    returns (bool)
  {
    return _IS_BORROWING_RESTRICTED_;
  }

  /**
   * @notice Get the timestamp at which a forced trade request was queued.
   *
   * @param  argsHash  The hash of the forced trade request args.
   *
   * @return Timestamp at which the forced trade was queued, or zero, if it was not queued or was
   *  vetoed by the VETO_GUARDIAN_ROLE.
   */
  function getQueuedForcedTradeTimestamp(
    bytes32 argsHash
  )
    external
    view
    returns (uint256)
  {
    return _QUEUED_FORCED_TRADE_TIMESTAMPS_[argsHash];
  }
}
