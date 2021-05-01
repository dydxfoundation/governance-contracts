// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import {IDydxRewardsVault} from '../interfaces/IDydxRewardsVault.sol';
import {Ownable} from '../dependencies/open-zeppelin/Ownable.sol';
import {IERC20} from '../interfaces/IERC20.sol';

/*
 * @title DydxRewardsVaultController
 * @dev Proxy smart contract to control the DydxRewardsVault, in order for dYdX governance to call functions on
 * the rewards vault implementation contract (since governance timelock is proxy-admin of the DydxRewardsVault,
 * and proxy-admin cannot call functions on implementation contract).
 * @author dYdX
 */
contract DydxRewardsVaultController is Ownable {
  IDydxRewardsVault public immutable DYDX_REWARDS_VAULT;

  constructor(address dydxGovShortTimelock, IDydxRewardsVault dydxRewardsVault) {
    transferOwnership(dydxGovShortTimelock);
    DYDX_REWARDS_VAULT = dydxRewardsVault;
  }

  function approve(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external onlyOwner {
    DYDX_REWARDS_VAULT.approve(token, recipient, amount);
  }

  function transfer(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external onlyOwner {
    DYDX_REWARDS_VAULT.transfer(token, recipient, amount);
  }
}
