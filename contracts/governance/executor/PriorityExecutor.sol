// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { PriorityTimelockExecutorMixin } from './PriorityTimelockExecutorMixin.sol';
import { ProposalValidatorMixin } from './ProposalValidatorMixin.sol';

/**
 * @title PriorityExecutor
 * @author dYdX
 *
 * @notice A time-locked executor for governance, where certain addresses may expedite execution.
 *
 *  Responsible for the following:
 *   - Check proposition power to validate the creation or cancellation of proposals.
 *   - Check voting power to validate the success of proposals.
 *   - Queue, execute, and cancel the transactions of successful proposals.
 *   - Manage a list of priority controllers who may execute proposals during the priority window.
 */
contract PriorityExecutor is
  PriorityTimelockExecutorMixin,
  ProposalValidatorMixin
{
  constructor(
    address admin,
    uint256 delay,
    uint256 gracePeriod,
    uint256 minimumDelay,
    uint256 maximumDelay,
    uint256 priorityPeriod,
    uint256 propositionThreshold,
    uint256 voteDuration,
    uint256 voteDifferential,
    uint256 minimumQuorum,
    address priorityExecutor
  )
    PriorityTimelockExecutorMixin(
      admin,
      delay,
      gracePeriod,
      minimumDelay,
      maximumDelay,
      priorityPeriod,
      priorityExecutor
    )
    ProposalValidatorMixin(
      propositionThreshold,
      voteDuration,
      voteDifferential,
      minimumQuorum
    )
  {}
}
