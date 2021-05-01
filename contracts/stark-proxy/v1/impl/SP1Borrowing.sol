pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {Math} from '../../../lib/Math.sol';
import {SafeMath} from '../../../lib/SafeMath.sol';
import {IERC20} from '../../../interfaces/IERC20.sol';
import {ILiquidityStakingV1} from '../../../interfaces/ILiquidityStakingV1.sol';
import {SP1Balances} from './SP1Balances.sol';

/**
 * @title SP1Borrowing
 * @author dYdX
 *
 * @notice Handles calls to the LiquidityStaking contract to borrow and repay funds.
 */
abstract contract SP1Borrowing is SP1Balances {
  using SafeMath for uint256;

  // ============ Events ============

  event Borrowed(uint256 amount, uint256 newBorrowedBalance);

  event RepaidLoan(uint256 amount, uint256 newBorrowedBalance, bool isGuardianAction);

  event RepaidDebt(uint256 amount, uint256 newBorrowedBalance, bool isGuardianAction);

  // ============ Constructor ============

  constructor(ILiquidityStakingV1 liquidityStaking, IERC20 token)
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
   * @return The borrowed amount.
   * @return The loan amount repaid.
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
    uint256 repayLoanAmount = 0;
    uint256 repayDebtAmount = 0;

    if (borrowedBalance > nextAllocatedBalance) {
      // Make necessary repayment before it is due.
      repayLoanAmount = borrowedBalance.sub(nextAllocatedBalance);
      require(
        tokenBalance >= repayLoanAmount,
        'SP1Borrowing: Insufficient funds to avoid falling short on loan payment'
      );
      _repayLoan(repayLoanAmount, false);
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

    return (borrowAmount, repayLoanAmount, repayDebtAmount);
  }

  function borrow(uint256 amount) external nonReentrant onlyRole(BORROWER_ROLE) {
    // Disallow if the guardian has restricted borrowing.
    require(
      !_IS_BORROWING_RESTRICTED_,
      'SP1Borrowing: Cannot borrow while borrowing is restricted'
    );

    _borrow(amount);
  }

  function repayLoan(uint256 amount) external nonReentrant onlyRole(BORROWER_ROLE) {
    _repayLoan(amount, false);
  }

  function repayDebt(uint256 amount) external nonReentrant onlyRole(BORROWER_ROLE) {
    _repayDebt(amount, false);
  }

  // ============ Internal Functions ============

  function _borrow(uint256 amount) internal {
    LIQUIDITY_STAKING.borrow(amount);
    emit Borrowed(amount, getBorrowedBalance());
  }

  function _repayLoan(uint256 amount, bool isGovernanceAction) internal {
    LIQUIDITY_STAKING.repayLoan(address(this), amount);
    emit RepaidLoan(amount, getBorrowedBalance(), isGovernanceAction);
  }

  function _repayDebt(uint256 amount, bool isGovernanceAction) internal {
    LIQUIDITY_STAKING.repayDebt(address(this), amount);
    emit RepaidDebt(amount, getDebtBalance(), isGovernanceAction);
  }
}
