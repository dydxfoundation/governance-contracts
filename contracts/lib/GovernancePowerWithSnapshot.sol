// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import {ERC20} from '../lib/ERC20.sol';
import {ITransferHook} from '../interfaces/ITransferHook.sol';
import {SafeMath} from '../lib/SafeMath.sol';
import {GovernancePowerDelegationERC20} from './GovernancePowerDelegationERC20.sol';

/**
 * @title GovernancePowerWithSnapshot
 * @notice ERC20 including snapshots of balances on transfer-related actions
 * @author dYdX
 **/
abstract contract GovernancePowerWithSnapshot is GovernancePowerDelegationERC20 {
  using SafeMath for uint256;

  /**
   * @dev The following storage layout points to the prior StakedToken.sol implementation:
   * _snapshots => _votingSnapshots
   * _snapshotsCounts =>  _votingSnapshotsCounts
   * _governor => _governor
   */
  mapping(address => mapping(uint256 => Snapshot)) public _votingSnapshots;
  mapping(address => uint256) public _votingSnapshotsCounts;

  /// @dev reference to the dYdX governance contract to call (if initialized) on _beforeTokenTransfer
  /// !!! IMPORTANT The dYdX governance is considered a trustable contract, being its responsibility
  /// to control all potential reentrancies by calling back the this contract
  ITransferHook public _governor;

  function _setDydxGovernance(ITransferHook governor) internal virtual {
    _governor = governor;
  }
}
