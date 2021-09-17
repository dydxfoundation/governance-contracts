// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { ExecutorWithTimelockMixin } from './ExecutorWithTimelockMixin.sol';
import { ProposalValidatorMixin } from './ProposalValidatorMixin.sol';

/**
 * @title Executor
 * @author dYdX
 *
 * @notice A time-locked executor for governance proposals.
 *
 *  Responsible for the following:
 *   - Check proposition power to validate the creation or cancellation of proposals.
 *   - Check voting power to validate the success of proposals.
 *   - Queue, execute, and cancel the transactions of successful proposals.
 */
contract Executor is
  ExecutorWithTimelockMixin,
  ProposalValidatorMixin
{
  constructor(
    address admin,
    uint256 delay,
    uint256 gracePeriod,
    uint256 minimumDelay,
    uint256 maximumDelay,
    uint256 propositionThreshold,
    uint256 voteDuration,
    uint256 voteDifferential,
    uint256 minimumQuorum
  )
    ExecutorWithTimelockMixin(admin, delay, gracePeriod, minimumDelay, maximumDelay)
    ProposalValidatorMixin(propositionThreshold, voteDuration, voteDifferential, minimumQuorum)
  {}
}
