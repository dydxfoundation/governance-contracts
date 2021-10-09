// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { ILiquidityStakingV1 } from '../../../interfaces/ILiquidityStakingV1.sol';
import { Math } from '../../../utils/Math.sol';
import { SP1Balances } from './SP1Balances.sol';

/**
 * @title SP1Borrowing
 * @author dYdX
 *
 * @dev Handles calls to the LiquidityStaking contract to borrow and repay funds.
 */
abstract contract SP1Borrowing is
  SP1Balances
{
  using SafeMath for uint256;

  // ============ Events ============

  event Borrowed(
    uint256 amount,
    uint256 newBorrowedBalance
  );

  event RepaidBorrow(
    uint256 amount,
    uint256 newBorrowedBalance,
    bool isGuardianAction
  );

  event RepaidDebt(
    uint256 amount,
    uint256 newDebtBalance,
    bool isGuardianAction
  );

  // ============ Constructor ============

  constructor(
    ILiquidityStakingV1 liquidityStaking,
    IERC20 token
  )
    SP1Balances(liquidityStaking, token)
  {}

  // ============ External Functions ============

  /**
   * @notice Automatically repay or borrow to bring borrowed balance to the next allocated balance.
   *  Must be called during the blackout window, to ensure allocated balance will not change before
   *  the start of the next epoch. Reverts if there are insufficient funds to prevent a shortfall.
   *
   *  Can be called with eth_call to view amounts that will be borrowed or repaid.
   *
   * @return The newly borrowed amount.
   * @return The borrow amount repaid.
   * @return The debt amount repaid.
   */
  function autoPayOrBorrow()
    external
    nonReentrant
    onlyRole(BORROWER_ROLE)
    returns (
      uint256,
      uint256,
      uint256
    )
  {
    // Ensure we are in the blackout window.
    require(
      LIQUIDITY_STAKING.inBlackoutWindow(),
      'SP1Borrowing: Auto-pay may only be used during the blackout window'
    );

    // Get the borrowed balance, next allocated balance, and token balance.
    uint256 borrowedBalance = getBorrowedBalance();
    uint256 nextAllocatedBalance = getAllocatedBalanceNextEpoch();
    uint256 tokenBalance = getTokenBalance();

    // Return values.
    uint256 borrowAmount = 0;
    uint256 repayBorrowAmount = 0;
    uint256 repayDebtAmount = 0;

    if (borrowedBalance > nextAllocatedBalance) {
      // Make the necessary repayment due by the end of the current epoch.
      repayBorrowAmount = borrowedBalance.sub(nextAllocatedBalance);
      require(
        tokenBalance >= repayBorrowAmount,
        'SP1Borrowing: Insufficient funds to avoid falling short on repayment'
      );
      _repayBorrow(repayBorrowAmount, false);
    } else {
      // Borrow the max borrowable amount.
      borrowAmount = getBorrowableAmount();
      if (borrowAmount != 0) {
        _borrow(borrowAmount);
      }
    }

    // Finally, use remaining funds to pay any overdue debt.
    uint256 debtBalance = getDebtBalance();
    repayDebtAmount = Math.min(debtBalance, tokenBalance);
    if (repayDebtAmount != 0) {
      _repayDebt(repayDebtAmount, false);
    }

    return (borrowAmount, repayBorrowAmount, repayDebtAmount);
  }

  function borrow(
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(BORROWER_ROLE)
  {
    // Disallow if the guardian has restricted borrowing.
    require(
      !_IS_BORROWING_RESTRICTED_,
      'SP1Borrowing: Cannot borrow while Restricted'
    );

    _borrow(amount);
  }

  function repayBorrow(
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(BORROWER_ROLE)
  {
    _repayBorrow(amount, false);
  }

  function repayDebt(
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(BORROWER_ROLE)
  {
    _repayDebt(amount, false);
  }

  // ============ Internal Functions ============

  function _borrow(
    uint256 amount
  )
    internal
  {
    LIQUIDITY_STAKING.borrow(amount);
    emit Borrowed(amount, getBorrowedBalance());
  }

  function _repayBorrow(
    uint256 amount,
    bool isGovernanceAction
  )
    internal
  {
    LIQUIDITY_STAKING.repayBorrow(address(this), amount);
    emit RepaidBorrow(amount, getBorrowedBalance(), isGovernanceAction);
  }

  function _repayDebt(
    uint256 amount,
    bool isGovernanceAction
  )
    internal
  {
    LIQUIDITY_STAKING.repayDebt(address(this), amount);
    emit RepaidDebt(amount, getDebtBalance(), isGovernanceAction);
  }
}
