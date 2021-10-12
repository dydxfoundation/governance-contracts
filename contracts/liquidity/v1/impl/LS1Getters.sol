// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { Math } from '../../../utils/Math.sol';
import { LS1Types } from '../lib/LS1Types.sol';
import { LS1Storage } from './LS1Storage.sol';

/**
 * @title LS1Getters
 * @author dYdX
 *
 * @dev Some external getter functions.
 */
abstract contract LS1Getters is
  LS1Storage
{
  using SafeMath for uint256;

  // ============ External Functions ============

  /**
   * @notice The token balance currently borrowed by the borrower.
   *
   * @param  borrower  The borrower whose balance to query.
   *
   * @return The number of tokens borrowed.
   */
  function getBorrowedBalance(
    address borrower
  )
    external
    view
    returns (uint256)
  {
    return _BORROWED_BALANCES_[borrower];
  }

  /**
   * @notice The total token balance borrowed by borrowers.
   *
   * @return The number of tokens borrowed.
   */
  function getTotalBorrowedBalance()
    external
    view
    returns (uint256)
  {
    return _TOTAL_BORROWED_BALANCE_;
  }

  /**
   * @notice The debt balance owed by the borrower.
   *
   * @param  borrower  The borrower whose balance to query.
   *
   * @return The number of tokens owed.
   */
  function getBorrowerDebtBalance(
    address borrower
  )
    external
    view
    returns (uint256)
  {
    return _BORROWER_DEBT_BALANCES_[borrower];
  }

  /**
   * @notice The total debt balance owed by borrowers.
   *
   * @return The number of tokens owed.
   */
  function getTotalBorrowerDebtBalance()
    external
    view
    returns (uint256)
  {
    return _TOTAL_BORROWER_DEBT_BALANCE_;
  }

  /**
   * @notice The total debt repaid by borrowers and available for stakers to withdraw.
   *
   * @return The number of tokens available.
   */
  function getTotalDebtAvailableToWithdraw()
    external
    view
    returns (uint256)
  {
    return _TOTAL_DEBT_AVAILABLE_TO_WITHDRAW_;
  }

  /**
   * @notice Check whether a borrower is restricted from new borrowing.
   *
   * @param  borrower  The borrower to check.
   *
   * @return Boolean `true` if the borrower is restricted, otherwise `false`.
   */
  function isBorrowingRestrictedForBorrower(
    address borrower
  )
    external
    view
    returns (bool)
  {
    return _BORROWER_RESTRICTIONS_[borrower];
  }

  /**
   * @notice The parameters specifying the function from timestamp to epoch number.
   *
   * @return The parameters struct with `interval` and `offset` fields.
   */
  function getEpochParameters()
    external
    view
    returns (LS1Types.EpochParameters memory)
  {
    return _EPOCH_PARAMETERS_;
  }

  /**
   * @notice The period of time at the end of each epoch in which withdrawals cannot be requested.
   *
   *  Other changes which could affect borrowers' repayment plans are also restricted during
   *  this period.
   */
  function getBlackoutWindow()
    external
    view
    returns (uint256)
  {
    return _BLACKOUT_WINDOW_;
  }

  /**
   * @notice Get information about a shortfall that occurred.
   *
   * @param  shortfallCounter  The array index for the shortfall event to look up.
   *
   * @return Struct containing the epoch and shortfall index value.
   */
  function getShortfall(
    uint256 shortfallCounter
  )
    external
    view
    returns (LS1Types.Shortfall memory)
  {
    return _SHORTFALLS_[shortfallCounter];
  }

  /**
   * @notice Get the number of shortfalls that have occurred.
   *
   * @return The number of shortfalls that have occurred.
   */
  function getShortfallCount()
    external
    view
    returns (uint256)
  {
    return _SHORTFALLS_.length;
  }
}
