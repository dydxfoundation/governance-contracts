// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import {VersionedInitializable} from '../utils/VersionedInitializable.sol';
import {IERC20} from '../interfaces/IERC20.sol';

/**
 * @title DydxRewardsVault
 * @notice Stores all the DYDX kept for incentives, just giving approval to the different
 * systems that will pull DYDX funds for their specific use case
 * @author dYdX
 **/
contract DydxRewardsVault is VersionedInitializable {
  event NewFundsAdmin(address indexed fundsAdmin);

  address internal _fundsAdmin;

  uint256 public constant REVISION = 1;

  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }

  function getFundsAdmin() external view returns (address) {
    return _fundsAdmin;
  }

  modifier onlyFundsAdmin() {
    require(msg.sender == _fundsAdmin, 'ONLY_BY_FUNDS_ADMIN');
    _;
  }

  function initialize(address rewardsVaultController) external initializer {
    _setFundsAdmin(rewardsVaultController);
  }

  function approve(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external onlyFundsAdmin {
    token.approve(recipient, amount);
  }

  function transfer(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external onlyFundsAdmin {
    token.transfer(recipient, amount);
  }

  function setFundsAdmin(address admin) public onlyFundsAdmin {
    _setFundsAdmin(admin);
  }

  function _setFundsAdmin(address admin) internal {
    _fundsAdmin = admin;
    emit NewFundsAdmin(admin);
  }
}
