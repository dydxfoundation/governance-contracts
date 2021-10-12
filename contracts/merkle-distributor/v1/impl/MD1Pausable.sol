// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { MD1Roles } from './MD1Roles.sol';

/**
 * @title MD1Pausable
 * @author dYdX
 *
 * @notice Allows authorized addresses to pause updates to the Merkle root.
 *
 *  For the Merkle root to be updated, the root must first be set on the oracle contract, then
 *  proposed on this contract, at which point the waiting period begins. During the waiting period,
 *  the root should be verified, and updates should be paused by the PAUSER_ROLE if the root is
 *  found to be incorrect.
 */
abstract contract MD1Pausable is
  MD1Roles
{
  // ============ Events ============

  /// @notice Emitted when root updates are paused.
  event RootUpdatesPaused();

  /// @notice Emitted when root updates are unpaused.
  event RootUpdatesUnpaused();

  // ============ Modifiers ============

  /**
   * @dev Enforce that a function may be called only while root updates are not paused.
   */
  modifier whenNotPaused() {
    require(
      !_ARE_ROOT_UPDATES_PAUSED_,
      'MD1Pausable: Updates paused'
    );
    _;
  }

  /**
   * @dev Enforce that a function may be called only while root updates are paused.
   */
  modifier whenPaused() {
    require(
      _ARE_ROOT_UPDATES_PAUSED_,
      'MD1Pausable: Updates not paused'
    );
    _;
  }

  // ============ External Functions ============

  /**
   * @dev Called by PAUSER_ROLE to prevent proposed Merkle roots from becoming active.
   */
  function pauseRootUpdates()
    onlyRole(PAUSER_ROLE)
    whenNotPaused
    nonReentrant
    external
  {
    _ARE_ROOT_UPDATES_PAUSED_ = true;
    emit RootUpdatesPaused();
  }

  /**
   * @dev Called by UNPAUSER_ROLE to resume allowing proposed Merkle roots to become active.
   */
  function unpauseRootUpdates()
    onlyRole(UNPAUSER_ROLE)
    whenPaused
    nonReentrant
    external
  {
    _ARE_ROOT_UPDATES_PAUSED_ = false;
    emit RootUpdatesUnpaused();
  }
}
