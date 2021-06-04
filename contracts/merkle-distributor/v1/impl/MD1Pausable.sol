pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {MD1Roles} from './MD1Roles.sol';

/**
 * @title MD1Pausable
 * @author dYdX
 *
 * @notice Implements the main features of the Merkle distributor contract.
 */
abstract contract MD1Pausable is MD1Roles {

  // ============ Events ============

  /// @notice Emitted when root updates are paused.
  event RootUpdatesPaused();

  /// @notice Emitted when root updates are unpaused.
  event RootUpdatesUnpaused();

  // ============ Modifiers ============

  /**
   * @dev Modifier to make a function callable only when root updates are not paused.
   */
  modifier whenNotPaused() {
    require(!_ARE_ROOT_UPDATES_PAUSED_, "MD1Pausable: Updates paused");
    _;
  }

  /**
   * @dev Modifier to make a function callable only when root updates are paused.
   */
  modifier whenPaused() {
    require(_ARE_ROOT_UPDATES_PAUSED_, "MD1Pausable: Updates not paused");
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
