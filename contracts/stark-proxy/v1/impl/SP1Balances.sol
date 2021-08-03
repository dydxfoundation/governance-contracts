// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { ILiquidityStakingV1 } from '../../../interfaces/ILiquidityStakingV1.sol';
import { Math } from '../../../utils/Math.sol';
import { SP1Roles } from './SP1Roles.sol';

/**
 * @title SP1Balances
 * @author dYdX
 *
 * @dev Contains common constants and functions related to token balances.
 */
abstract contract SP1Balances is
  SP1Roles
{
  using SafeMath for uint256;

  // ============ Constants ============

  IERC20 public immutable TOKEN;

  ILiquidityStakingV1 public immutable LIQUIDITY_STAKING;

  // ============ Constructor ============

  constructor(
    ILiquidityStakingV1 liquidityStaking,
    IERC20 token
  ) {
    LIQUIDITY_STAKING = liquidityStaking;
    TOKEN = token;
  }

  // ============ Public Functions ============

  function getAllocatedBalanceCurrentEpoch()
    public
    view
    returns (uint256)
  {
    return LIQUIDITY_STAKING.getAllocatedBalanceCurrentEpoch(address(this));
  }

  function getAllocatedBalanceNextEpoch()
    public
    view
    returns (uint256)
  {
    return LIQUIDITY_STAKING.getAllocatedBalanceNextEpoch(address(this));
  }

  function getBorrowableAmount()
    public
    view
    returns (uint256)
  {
    if (_IS_BORROWING_RESTRICTED_) {
      return 0;
    }
    return LIQUIDITY_STAKING.getBorrowableAmount(address(this));
  }

  function getBorrowedBalance()
    public
    view
    returns (uint256)
  {
    return LIQUIDITY_STAKING.getBorrowedBalance(address(this));
  }

  function getDebtBalance()
    public
    view
    returns (uint256)
  {
    return LIQUIDITY_STAKING.getBorrowerDebtBalance(address(this));
  }

  function getBorrowedAndDebtBalance()
    public
    view
    returns (uint256)
  {
    return getBorrowedBalance().add(getDebtBalance());
  }

  function getTokenBalance()
    public
    view
    returns (uint256)
  {
    return TOKEN.balanceOf(address(this));
  }
}
