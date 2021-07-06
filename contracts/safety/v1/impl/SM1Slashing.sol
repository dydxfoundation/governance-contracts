pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../../interfaces/IERC20.sol';
import {SafeERC20} from '../../../lib/SafeERC20.sol';
import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {Math} from '../../../lib/Math.sol';
import {SafeCast} from '../../../lib/SafeCast.sol';
import {SM1Types} from '../lib/SM1Types.sol';
import {SM1Staking} from './SM1Staking.sol';

/**
 * @title SM1Slashing
 * @author dYdX
 *
 * @notice Provides the slashing function for removing funds from the contract.
 *
 *  SLASHING:
 *
 *   All funds in the contract, active or inactive, are slashable. There are two types of slahes:
 *   partial or full. A partial slash is recorded by updating the exchange rate. To reduce the
 *   possibility of overflow in the exchange rate, we place an upper bound on the amount by which
 *   the exchange rate can grow from a single slash (in other words, we place a lower bound on the
 *   fraction of funds which may be left behind by a partial slash). If this limit would be
 *   exceeded, we instead treat the slash as a full slash.
 *
 *   A full slash is recorded by adding information about the slash to the storage array of full
 *   slashes. This has the effect of setting all balances to zero in the timestamp in which the
 *   slash occurred (see SM1StakedBalances.sol). After a full slash, the exchange rate is reset to
 *   a value of one.
 *
 *  REWARDS AND GOVERNANCE POWER ACCOUNTING:
 *
 *   By accounting for slashes via the global exchange rate, we can execute partial slashes without
 *   any update to staked balances. The earning of rewards is unaffected by partial slashes.
 *   Governance power takes partial slashes into account by using snapshots of the exchange rate
 *   inside the getPowerAtBlock() function.
 *
 *   In contrast, a full slash does affect staked balances, and requires different accounting.
 *   A full slash has the effect of setting all balances to zero, causing the earning of rewards to
 *   stop. This is handled in SM1StakedBalances.sol by comparing the cached fullSlashCounter of a
 *   balance to the length of the _FULL_SLASHES_ array, and using stored information about the
 *   epoch and rewards index at the time a full slash occurred to calculate the rewards amounts.
 *
 *   Governance power takes full slashes into account by using snapshots of the fullSlashCounter
 *   stored on user balances.
 *
 *   Note that getPowerAtBlock() returns the governance power as of the end of the specified block.
 */
abstract contract SM1Slashing is SM1Staking {
  using SafeCast for uint256;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice The maximum factor by which the exchange rate may grow due to a partial slash.
  ///  If this limit would be exceeded, then we execute a full slash instead.
  uint256 public constant MAX_EXCHANGE_RATE_GROWTH_PER_SLASH = 20;

  // ============ Events ============

  event Slashed(uint256 amount, address recipient, uint256 newExchangeRate, bool isFullSlash);

  // ============ External Functions ============

  /**
   * @notice Slash staked token balances and withdraw those funds to the specified address.
   *
   * @param  requestedAmount  The request slash amount.
   * @param  recipient        The address to receive the slashed tokens.
   *
   * @return The amount of tokens slashed.
   */
  function slash(
    uint256 requestedAmount,
    address recipient
  )
    external
    onlyRole(SLASHER_ROLE)
    nonReentrant
    returns (uint256)
  {
    uint256 underlyingBalance = STAKED_TOKEN.balanceOf(address(this));
    uint256 partialSlashAmount = Math.min(requestedAmount, underlyingBalance);
    uint256 remainingAfterPartialSlash = underlyingBalance.sub(partialSlashAmount);

    if (remainingAfterPartialSlash == 0) {
      return _fullSlash(underlyingBalance, recipient);
    }

    if (
      underlyingBalance.div(remainingAfterPartialSlash) >= MAX_EXCHANGE_RATE_GROWTH_PER_SLASH
    ) {
      return _fullSlash(underlyingBalance, recipient);
    }

    // Partial slash: update the exchange rate.
    //
    // It is unlikely, but possible, for this multiplication to overflow.
    // In such a case, the slasher should request a full slash to reset the exchange rate.
    uint256 newExchangeRate = (
      _EXCHANGE_RATE_.mul(underlyingBalance).div(remainingAfterPartialSlash)
    );
    _EXCHANGE_RATE_ = newExchangeRate;

    // Transfer the slashed token.
    STAKED_TOKEN.safeTransfer(recipient, partialSlashAmount);

    emit Slashed(partialSlashAmount, recipient, newExchangeRate, false);
    return partialSlashAmount;
  }

  function _fullSlash(
    uint256 underlyingBalance,
    address recipient
  )
    internal
    returns (uint256)
  {
    // We must settle the total active balance to ensure the index is recorded at the epoch
    // boundary as needed.
    uint256 totalStaked = _settleTotalActiveBalance();

    // Rewards cease to be earned when a full slash occurs, until new funds are deposited.
    uint256 rewardsGlobalIndex = _settleGlobalIndexUpToNow(totalStaked);

    // Write the full slash.
    _FULL_SLASHES_.push(SM1Types.FullSlash({
      epoch: getCurrentEpoch().toUint128(),
      rewardsGlobalIndex: rewardsGlobalIndex.toUint128()
    }));

    // Reset the exchange rate.
    _EXCHANGE_RATE_ = EXCHANGE_RATE_BASE;

    // Transfer the slashed token.
    STAKED_TOKEN.safeTransfer(recipient, underlyingBalance);

    emit Slashed(underlyingBalance, recipient, EXCHANGE_RATE_BASE, true);
    return underlyingBalance;
  }
}
