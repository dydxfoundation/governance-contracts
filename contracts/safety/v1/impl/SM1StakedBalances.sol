// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { SafeCast } from '../lib/SafeCast.sol';
import { SM1Types } from '../lib/SM1Types.sol';
import { SM1Rewards } from './SM1Rewards.sol';

/**
 * @title SM1StakedBalances
 * @author dYdX
 *
 * @dev Accounting of staked balances.
 *
 *  NOTE: Functions may revert if epoch zero has not started.
 *
 *  NOTE: All amounts dealt with in this file are denominated in staked units, which because of the
 *   exchange rate, may not correspond one-to-one with the underlying token. See SM1Staking.sol.
 *
 *  STAKED BALANCE ACCOUNTING:
 *
 *   A staked balance is in one of two states:
 *     - active: Earning staking rewards; cannot be withdrawn by staker; may be slashed.
 *     - inactive: Not earning rewards; can be withdrawn by the staker; may be slashed.
 *
 *   A staker may have a combination of active and inactive balances. The following operations
 *   affect staked balances as follows:
 *     - deposit:            Increase active balance.
 *     - request withdrawal: At the end of the current epoch, move some active funds to inactive.
 *     - withdraw:           Decrease inactive balance.
 *     - transfer:           Move some active funds to another staker.
 *
 *   To encode the fact that a balance may be scheduled to change at the end of a certain epoch, we
 *   store each balance as a struct of three fields: currentEpoch, currentEpochBalance, and
 *   nextEpochBalance.
 *
 *  REWARDS ACCOUNTING:
 *
 *   Active funds earn rewards for the period of time that they remain active. This means, after
 *   requesting a withdrawal of some funds, those funds will continue to earn rewards until the end
 *   of the epoch. For example:
 *
 *     epoch: n        n + 1      n + 2      n + 3
 *            |          |          |          |
 *            +----------+----------+----------+-----...
 *               ^ t_0: User makes a deposit.
 *                          ^ t_1: User requests a withdrawal of all funds.
 *                                  ^ t_2: The funds change state from active to inactive.
 *
 *   In the above scenario, the user would earn rewards for the period from t_0 to t_2, varying
 *   with the total staked balance in that period. If the user only request a withdrawal for a part
 *   of their balance, then the remaining balance would continue earning rewards beyond t_2.
 *
 *   User rewards must be settled via SM1Rewards any time a user's active balance changes. Special
 *   attention is paid to the the epoch boundaries, where funds may have transitioned from active
 *   to inactive.
 *
 *  SETTLEMENT DETAILS:
 *
 *   Internally, this module uses the following types of operations on stored balances:
 *     - Load:            Loads a balance, while applying settlement logic internally to get the
 *                        up-to-date result. Returns settlement results without updating state.
 *     - Store:           Stores a balance.
 *     - Load-for-update: Performs a load and applies updates as needed to rewards accounting.
 *                        Since this is state-changing, it must be followed by a store operation.
 *     - Settle:          Performs load-for-update and store operations.
 *
 *   This module is responsible for maintaining the following invariants to ensure rewards are
 *   calculated correctly:
 *     - When an active balance is loaded for update, if a rollover occurs from one epoch to the
 *       next, the rewards index must be settled up to the boundary at which the rollover occurs.
 *     - Because the global rewards index is needed to update the user rewards index, the total
 *       active balance must be settled before any staker balances are settled or loaded for update.
 *     - A staker's balance must be settled before their rewards are settled.
 */
abstract contract SM1StakedBalances is
  SM1Rewards
{
  using SafeCast for uint256;
  using SafeMath for uint256;

  // ============ Constructor ============

  constructor(
    IERC20 rewardsToken,
    address rewardsTreasury,
    uint256 distributionStart,
    uint256 distributionEnd
  )
    SM1Rewards(rewardsToken, rewardsTreasury, distributionStart, distributionEnd)
  {}

  // ============ Public Functions ============

  /**
   * @notice Get the current active balance of a staker.
   */
  function getActiveBalanceCurrentEpoch(
    address staker
  )
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    (SM1Types.StoredBalance memory balance, , , ) = _loadActiveBalance(
      _ACTIVE_BALANCES_[staker]
    );
    return uint256(balance.currentEpochBalance);
  }

  /**
   * @notice Get the next epoch active balance of a staker.
   */
  function getActiveBalanceNextEpoch(
    address staker
  )
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    (SM1Types.StoredBalance memory balance, , , ) = _loadActiveBalance(
      _ACTIVE_BALANCES_[staker]
    );
    return uint256(balance.nextEpochBalance);
  }

  /**
   * @notice Get the current total active balance.
   */
  function getTotalActiveBalanceCurrentEpoch()
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    (SM1Types.StoredBalance memory balance, , , ) = _loadActiveBalance(
      _TOTAL_ACTIVE_BALANCE_
    );
    return uint256(balance.currentEpochBalance);
  }

  /**
   * @notice Get the next epoch total active balance.
   */
  function getTotalActiveBalanceNextEpoch()
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    (SM1Types.StoredBalance memory balance, , , ) = _loadActiveBalance(
      _TOTAL_ACTIVE_BALANCE_
    );
    return uint256(balance.nextEpochBalance);
  }

  /**
   * @notice Get the current inactive balance of a staker.
   * @dev The balance is converted via the index to token units.
   */
  function getInactiveBalanceCurrentEpoch(
    address staker
  )
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    SM1Types.StoredBalance memory balance = _loadInactiveBalance(_INACTIVE_BALANCES_[staker]);
    return uint256(balance.currentEpochBalance);
  }

  /**
   * @notice Get the next epoch inactive balance of a staker.
   * @dev The balance is converted via the index to token units.
   */
  function getInactiveBalanceNextEpoch(
    address staker
  )
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    SM1Types.StoredBalance memory balance = _loadInactiveBalance(_INACTIVE_BALANCES_[staker]);
    return uint256(balance.nextEpochBalance);
  }

  /**
   * @notice Get the current total inactive balance.
   */
  function getTotalInactiveBalanceCurrentEpoch()
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    SM1Types.StoredBalance memory balance = _loadInactiveBalance(_TOTAL_INACTIVE_BALANCE_);
    return uint256(balance.currentEpochBalance);
  }

  /**
   * @notice Get the next epoch total inactive balance.
   */
  function getTotalInactiveBalanceNextEpoch()
    public
    view
    returns (uint256)
  {
    if (!hasEpochZeroStarted()) {
      return 0;
    }
    SM1Types.StoredBalance memory balance = _loadInactiveBalance(_TOTAL_INACTIVE_BALANCE_);
    return uint256(balance.nextEpochBalance);
  }

  /**
   * @notice Get the current transferable balance for a user. The user can
   *  only transfer their balance that is not currently inactive or going to be
   *  inactive in the next epoch. Note that this means the user's transferable funds
   *  are their active balance of the next epoch.
   *
   * @param  account  The account to get the transferable balance of.
   *
   * @return The user's transferable balance.
   */
  function getTransferableBalance(
    address account
  )
    public
    view
    returns (uint256)
  {
    return getActiveBalanceNextEpoch(account);
  }

  // ============ Internal Functions ============

  function _increaseCurrentAndNextActiveBalance(
    address staker,
    uint256 amount
  )
    internal
  {
    // Always settle total active balance before settling a staker active balance.
    uint256 oldTotalBalance = _increaseCurrentAndNextBalances(address(0), true, amount);
    uint256 oldUserBalance = _increaseCurrentAndNextBalances(staker, true, amount);

    // When an active balance changes at current timestamp, settle rewards to the current timestamp.
    _settleUserRewardsUpToNow(staker, oldUserBalance, oldTotalBalance);
  }

  function _moveNextBalanceActiveToInactive(
    address staker,
    uint256 amount
  )
    internal
  {
    // Decrease the active balance for the next epoch.
    // Always settle total active balance before settling a staker active balance.
    _decreaseNextBalance(address(0), true, amount);
    _decreaseNextBalance(staker, true, amount);

    // Increase the inactive balance for the next epoch.
    _increaseNextBalance(address(0), false, amount);
    _increaseNextBalance(staker, false, amount);

    // Note that we don't need to settle rewards since the current active balance did not change.
  }

  function _transferCurrentAndNextActiveBalance(
    address sender,
    address recipient,
    uint256 amount
  )
    internal
  {
    // Always settle total active balance before settling a staker active balance.
    uint256 totalBalance = _settleTotalActiveBalance();

    // Move current and next active balances from sender to recipient.
    uint256 oldSenderBalance = _decreaseCurrentAndNextBalances(sender, true, amount);
    uint256 oldRecipientBalance = _increaseCurrentAndNextBalances(recipient, true, amount);

    // When an active balance changes at current timestamp, settle rewards to the current timestamp.
    _settleUserRewardsUpToNow(sender, oldSenderBalance, totalBalance);
    _settleUserRewardsUpToNow(recipient, oldRecipientBalance, totalBalance);
  }

  function _decreaseCurrentAndNextInactiveBalance(
    address staker,
    uint256 amount
  )
    internal
  {
    // Decrease the inactive balance for the next epoch.
    _decreaseCurrentAndNextBalances(address(0), false, amount);
    _decreaseCurrentAndNextBalances(staker, false, amount);

    // Note that we don't settle rewards since active balances are not affected.
  }

  function _settleTotalActiveBalance()
    internal
    returns (uint256)
  {
    return _settleBalance(address(0), true);
  }

  function _settleAndClaimRewards(
    address staker,
    address recipient
  )
    internal
    returns (uint256)
  {
    // Always settle total active balance before settling a staker active balance.
    uint256 totalBalance = _settleTotalActiveBalance();

    // Always settle staker active balance before settling staker rewards.
    uint256 userBalance = _settleBalance(staker, true);

    // Settle rewards balance since we want to claim the full accrued amount.
    _settleUserRewardsUpToNow(staker, userBalance, totalBalance);

    // Claim rewards balance.
    return _claimRewards(staker, recipient);
  }

  // ============ Private Functions ============

  /**
   * @dev Load a balance for update and then store it.
   */
  function _settleBalance(
    address maybeStaker,
    bool isActiveBalance
  )
    private
    returns (uint256)
  {
    SM1Types.StoredBalance storage balancePtr = _getBalancePtr(maybeStaker, isActiveBalance);
    SM1Types.StoredBalance memory balance =
      _loadBalanceForUpdate(balancePtr, maybeStaker, isActiveBalance);

    uint256 currentBalance = uint256(balance.currentEpochBalance);

    _storeBalance(balancePtr, balance);
    return currentBalance;
  }

  /**
   * @dev Settle a balance while applying an increase.
   */
  function _increaseCurrentAndNextBalances(
    address maybeStaker,
    bool isActiveBalance,
    uint256 amount
  )
    private
    returns (uint256)
  {
    SM1Types.StoredBalance storage balancePtr = _getBalancePtr(maybeStaker, isActiveBalance);
    SM1Types.StoredBalance memory balance =
      _loadBalanceForUpdate(balancePtr, maybeStaker, isActiveBalance);

    uint256 originalCurrentBalance = uint256(balance.currentEpochBalance);
    balance.currentEpochBalance = originalCurrentBalance.add(amount).toUint240();
    balance.nextEpochBalance = uint256(balance.nextEpochBalance).add(amount).toUint240();

    _storeBalance(balancePtr, balance);
    return originalCurrentBalance;
  }

  /**
   * @dev Settle a balance while applying a decrease.
   */
  function _decreaseCurrentAndNextBalances(
    address maybeStaker,
    bool isActiveBalance,
    uint256 amount
  )
    private
    returns (uint256)
  {
    SM1Types.StoredBalance storage balancePtr = _getBalancePtr(maybeStaker, isActiveBalance);
    SM1Types.StoredBalance memory balance =
      _loadBalanceForUpdate(balancePtr, maybeStaker, isActiveBalance);

    uint256 originalCurrentBalance = uint256(balance.currentEpochBalance);
    balance.currentEpochBalance = originalCurrentBalance.sub(amount).toUint240();
    balance.nextEpochBalance = uint256(balance.nextEpochBalance).sub(amount).toUint240();

    _storeBalance(balancePtr, balance);
    return originalCurrentBalance;
  }

  /**
   * @dev Settle a balance while applying an increase.
   */
  function _increaseNextBalance(
    address maybeStaker,
    bool isActiveBalance,
    uint256 amount
  )
    private
  {
    SM1Types.StoredBalance storage balancePtr = _getBalancePtr(maybeStaker, isActiveBalance);
    SM1Types.StoredBalance memory balance =
      _loadBalanceForUpdate(balancePtr, maybeStaker, isActiveBalance);

    balance.nextEpochBalance = uint256(balance.nextEpochBalance).add(amount).toUint240();

    _storeBalance(balancePtr, balance);
  }

  /**
   * @dev Settle a balance while applying a decrease.
   */
  function _decreaseNextBalance(
    address maybeStaker,
    bool isActiveBalance,
    uint256 amount
  )
    private
  {
    SM1Types.StoredBalance storage balancePtr = _getBalancePtr(maybeStaker, isActiveBalance);
    SM1Types.StoredBalance memory balance =
      _loadBalanceForUpdate(balancePtr, maybeStaker, isActiveBalance);

    balance.nextEpochBalance = uint256(balance.nextEpochBalance).sub(amount).toUint240();

    _storeBalance(balancePtr, balance);
  }

  function _getBalancePtr(
    address maybeStaker,
    bool isActiveBalance
  )
    private
    view
    returns (SM1Types.StoredBalance storage)
  {
    // Active.
    if (isActiveBalance) {
      if (maybeStaker != address(0)) {
        return _ACTIVE_BALANCES_[maybeStaker];
      }
      return _TOTAL_ACTIVE_BALANCE_;
    }

    // Inactive.
    if (maybeStaker != address(0)) {
      return _INACTIVE_BALANCES_[maybeStaker];
    }
    return _TOTAL_INACTIVE_BALANCE_;
  }

  /**
   * @dev Load a balance for updating.
   *
   *  IMPORTANT: This function may modify state, and so the balance MUST be stored afterwards.
   *    - For active balances:
   *      - If a rollover occurs, rewards are settled up to the epoch boundary.
   *
   * @param  balancePtr       A storage pointer to the balance.
   * @param  maybeStaker      The user address, or address(0) to update total balance.
   * @param  isActiveBalance  Whether the balance is an active balance.
   */
  function _loadBalanceForUpdate(
    SM1Types.StoredBalance storage balancePtr,
    address maybeStaker,
    bool isActiveBalance
  )
    private
    returns (SM1Types.StoredBalance memory)
  {
    // Active balance.
    if (isActiveBalance) {
      (
        SM1Types.StoredBalance memory balance,
        uint256 beforeRolloverEpoch,
        uint256 beforeRolloverBalance,
        bool didRolloverOccur
      ) = _loadActiveBalance(balancePtr);
      if (didRolloverOccur) {
        // Handle the effect of the balance rollover on rewards. We must partially settle the index
        // up to the epoch boundary where the change in balance occurred. We pass in the balance
        // from before the boundary.
        if (maybeStaker == address(0)) {
          // If it's the total active balance...
          _settleGlobalIndexUpToEpoch(beforeRolloverBalance, beforeRolloverEpoch);
        } else {
          // If it's a user active balance...
          _settleUserRewardsUpToEpoch(maybeStaker, beforeRolloverBalance, beforeRolloverEpoch);
        }
      }
      return balance;
    }

    // Inactive balance.
    return _loadInactiveBalance(balancePtr);
  }

  function _loadActiveBalance(
    SM1Types.StoredBalance storage balancePtr
  )
    private
    view
    returns (
      SM1Types.StoredBalance memory,
      uint256,
      uint256,
      bool
    )
  {
    SM1Types.StoredBalance memory balance = balancePtr;

    // Return these as they may be needed for rewards settlement.
    uint256 beforeRolloverEpoch = uint256(balance.currentEpoch);
    uint256 beforeRolloverBalance = uint256(balance.currentEpochBalance);
    bool didRolloverOccur = false;

    // Roll the balance forward if needed.
    uint256 currentEpoch = getCurrentEpoch();
    if (currentEpoch > uint256(balance.currentEpoch)) {
      didRolloverOccur = balance.currentEpochBalance != balance.nextEpochBalance;

      balance.currentEpoch = currentEpoch.toUint16();
      balance.currentEpochBalance = balance.nextEpochBalance;
    }

    return (balance, beforeRolloverEpoch, beforeRolloverBalance, didRolloverOccur);
  }

  function _loadInactiveBalance(
    SM1Types.StoredBalance storage balancePtr
  )
    private
    view
    returns (SM1Types.StoredBalance memory)
  {
    SM1Types.StoredBalance memory balance = balancePtr;

    // Roll the balance forward if needed.
    uint256 currentEpoch = getCurrentEpoch();
    if (currentEpoch > uint256(balance.currentEpoch)) {
      balance.currentEpoch = currentEpoch.toUint16();
      balance.currentEpochBalance = balance.nextEpochBalance;
    }

    return balance;
  }

  /**
   * @dev Store a balance.
   */
  function _storeBalance(
    SM1Types.StoredBalance storage balancePtr,
    SM1Types.StoredBalance memory balance
  )
    private
  {
    // Note: This should use a single `sstore` when compiler optimizations are enabled.
    balancePtr.currentEpoch = balance.currentEpoch;
    balancePtr.currentEpochBalance = balance.currentEpochBalance;
    balancePtr.nextEpochBalance = balance.nextEpochBalance;
  }
}
