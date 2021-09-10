// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

/**
 * @title ILiquidityStakingV1
 * @author dYdX
 *
 * @notice Partial interface for LiquidityStakingV1.
 */
interface ILiquidityStakingV1 {

  function getToken() external view virtual returns (address);

  function getBorrowedBalance(address borrower) external view virtual returns (uint256);

  function getBorrowerDebtBalance(address borrower) external view virtual returns (uint256);

  function isBorrowingRestrictedForBorrower(address borrower) external view virtual returns (bool);

  function getTimeRemainingInEpoch() external view virtual returns (uint256);

  function inBlackoutWindow() external view virtual returns (bool);

  // LS1Borrowing
  function borrow(uint256 amount) external virtual;

  function repayBorrow(address borrower, uint256 amount) external virtual;

  function getAllocatedBalanceCurrentEpoch(address borrower)
    external
    view
    virtual
    returns (uint256);

  function getAllocatedBalanceNextEpoch(address borrower) external view virtual returns (uint256);

  function getBorrowableAmount(address borrower) external view virtual returns (uint256);

  // LS1DebtAccounting
  function repayDebt(address borrower, uint256 amount) external virtual;
}
