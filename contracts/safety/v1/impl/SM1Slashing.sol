// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeERC20 } from '../../../dependencies/open-zeppelin/SafeERC20.sol';
import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { Math } from '../../../utils/Math.sol';
import { SM1Types } from '../lib/SM1Types.sol';
import { SM1Roles } from './SM1Roles.sol';
import { SM1Staking } from './SM1Staking.sol';

/**
 * @title SM1Slashing
 * @author dYdX
 *
 * @dev Provides the slashing function for removing funds from the contract.
 *
 *  SLASHING:
 *
 *   All funds in the contract, active or inactive, are slashable. Slashes are recorded by updating
 *   the exchange rate, and to simplify the technical implementation, we disallow full slashes.
 *   To reduce the possibility of overflow in the exchange rate, we place an upper bound on the
 *   fraction of funds that may be slashed in a single slash.
 *
 *   Warning: Slashing is not possible if the slash would cause the exchange rate to overflow.
 *
 *  REWARDS AND GOVERNANCE POWER ACCOUNTING:
 *
 *   Since all slashes are accounted for by a global exchange rate, slashes do not require any
 *   update to staked balances. The earning of rewards is unaffected by slashes.
 *
 *   Governance power takes slashes into account by using snapshots of the exchange rate inside
 *   the getPowerAtBlock() function. Note that getPowerAtBlock() returns the governance power as of
 *   the end of the specified block.
 */
abstract contract SM1Slashing is
  SM1Staking,
  SM1Roles
{
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice The maximum fraction of funds that may be slashed in a single slash (numerator).
  uint256 public constant MAX_SLASH_NUMERATOR = 95;

  /// @notice The maximum fraction of funds that may be slashed in a single slash (denominator).
  uint256 public constant MAX_SLASH_DENOMINATOR = 100;

  // ============ Events ============

  event Slashed(
    uint256 amount,
    address recipient,
    uint256 newExchangeRate
  );

  // ============ External Functions ============

  /**
   * @notice Slash staked token balances and withdraw those funds to the specified address.
   *
   * @param  requestedSlashAmount  The request slash amount, denominated in the underlying token.
   * @param  recipient             The address to receive the slashed tokens.
   *
   * @return The amount slashed, denominated in the underlying token.
   */
  function slash(
    uint256 requestedSlashAmount,
    address recipient
  )
    external
    onlyRole(SLASHER_ROLE)
    nonReentrant
    returns (uint256)
  {
    uint256 underlyingBalance = STAKED_TOKEN.balanceOf(address(this));

    if (underlyingBalance == 0) {
      return 0;
    }

    // Get the slash amount and remaining amount. Note that remainingAfterSlash is nonzero.
    uint256 maxSlashAmount = underlyingBalance.mul(MAX_SLASH_NUMERATOR).div(MAX_SLASH_DENOMINATOR);
    uint256 slashAmount = Math.min(requestedSlashAmount, maxSlashAmount);
    uint256 remainingAfterSlash = underlyingBalance.sub(slashAmount);

    if (slashAmount == 0) {
      return 0;
    }

    // Update the exchange rate.
    //
    // Warning: Can revert if the max exchange rate is exceeded.
    uint256 newExchangeRate = updateExchangeRate(underlyingBalance, remainingAfterSlash);

    // Transfer the slashed token.
    STAKED_TOKEN.safeTransfer(recipient, slashAmount);

    emit Slashed(slashAmount, recipient, newExchangeRate);
    return slashAmount;
  }
}
