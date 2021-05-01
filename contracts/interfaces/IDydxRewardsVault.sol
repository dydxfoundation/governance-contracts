// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from './IERC20.sol';

/**
 * @title IDydxRewardsVault
 * @author dYdX
 *
 * @notice Interface for contract holding DYDX funds for incentives.
 */
interface IDydxRewardsVault {
  function approve(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external;

  function transfer(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external;
}
