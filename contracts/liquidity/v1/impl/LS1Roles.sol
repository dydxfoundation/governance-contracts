// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { LS1Storage } from './LS1Storage.sol';

/**
 * @title LS1Roles
 * @author dYdX
 *
 * @dev Defines roles used in the LiquidityStakingV1 contract. The hierarchy of roles and powers
 *  of each role are described below.
 *
 *  Roles:
 *
 *    OWNER_ROLE
 *      | -> May add or remove users from any of the below roles it manages.
 *      |
 *      +-- EPOCH_PARAMETERS_ROLE
 *      |     -> May set epoch parameters such as the interval, offset, and blackout window.
 *      |
 *      +-- REWARDS_RATE_ROLE
 *      |     -> May set the emission rate of rewards.
 *      |
 *      +-- BORROWER_ADMIN_ROLE
 *      |     -> May set borrower allocations and allow/restrict borrowers from borrowing.
 *      |
 *      +-- CLAIM_OPERATOR_ROLE
 *      |     -> May claim rewards on behalf of a user.
 *      |
 *      +-- STAKE_OPERATOR_ROLE
 *      |     -> May manipulate user's staked funds (e.g. perform withdrawals on behalf of a user).
 *      |
 *      +-- DEBT_OPERATOR_ROLE
 *           -> May decrease borrow debt and decrease staker debt.
 */
abstract contract LS1Roles is
  LS1Storage
{
  bytes32 public constant OWNER_ROLE = keccak256('OWNER_ROLE');
  bytes32 public constant EPOCH_PARAMETERS_ROLE = keccak256('EPOCH_PARAMETERS_ROLE');
  bytes32 public constant REWARDS_RATE_ROLE = keccak256('REWARDS_RATE_ROLE');
  bytes32 public constant BORROWER_ADMIN_ROLE = keccak256('BORROWER_ADMIN_ROLE');
  bytes32 public constant CLAIM_OPERATOR_ROLE = keccak256('CLAIM_OPERATOR_ROLE');
  bytes32 public constant STAKE_OPERATOR_ROLE = keccak256('STAKE_OPERATOR_ROLE');
  bytes32 public constant DEBT_OPERATOR_ROLE = keccak256('DEBT_OPERATOR_ROLE');

  function __LS1Roles_init() internal {
    // Assign roles to the sender.
    //
    // The DEBT_OPERATOR_ROLE, STAKE_OPERATOR_ROLE, and CLAIM_OPERATOR_ROLE roles are not
    // initially assigned. These can be assigned to other smart contracts to provide additional
    // functionality for users.
    _setupRole(OWNER_ROLE, msg.sender);
    _setupRole(EPOCH_PARAMETERS_ROLE, msg.sender);
    _setupRole(REWARDS_RATE_ROLE, msg.sender);
    _setupRole(BORROWER_ADMIN_ROLE, msg.sender);

    // Set OWNER_ROLE as the admin of all roles.
    _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
    _setRoleAdmin(EPOCH_PARAMETERS_ROLE, OWNER_ROLE);
    _setRoleAdmin(REWARDS_RATE_ROLE, OWNER_ROLE);
    _setRoleAdmin(BORROWER_ADMIN_ROLE, OWNER_ROLE);
    _setRoleAdmin(CLAIM_OPERATOR_ROLE, OWNER_ROLE);
    _setRoleAdmin(STAKE_OPERATOR_ROLE, OWNER_ROLE);
    _setRoleAdmin(DEBT_OPERATOR_ROLE, OWNER_ROLE);
  }
}
