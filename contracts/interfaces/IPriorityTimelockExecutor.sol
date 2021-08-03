// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IDydxGovernor } from './IDydxGovernor.sol';
import { IExecutorWithTimelock } from './IExecutorWithTimelock.sol';

interface IPriorityTimelockExecutor is
  IExecutorWithTimelock
{

  /**
   * @dev emitted when a priority controller is added or removed
   * @param account address added or removed
   * @param isPriorityController whether the account is now a priority controller
   */
  event PriorityControllerUpdated(address account, bool isPriorityController);


  /**
   * @dev emitted when a new priority period is set
   * @param priorityPeriod new priority period
   **/
  event NewPriorityPeriod(uint256 priorityPeriod);

  /**
   * @dev emitted when an action is locked or unlocked for execution by a priority controller
   * @param actionHash hash of the action
   * @param isUnlockedForExecution whether the proposal is executable during the priority period
   */
  event UpdatedActionPriorityStatus(bytes32 actionHash, bool isUnlockedForExecution);
}
