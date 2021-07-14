pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SM1Storage} from './SM1Storage.sol';

/**
 * @title SM1Roles
 * @author dYdX
 *
 * @dev Defines roles used in the SafetyModuleV1 contract. The hierarchy of roles and powers
 *  of each role are described below.
 *
 *  Roles:
 *
 *    OWNER_ROLE
 *      | -> May add or remove addresses from any of the roles below.
 *      |
 *      +-- SLASHER_ROLE
 *      |     -> Can slash staked token balances and withdraw those funds.
 *      |
 *      +-- EPOCH_PARAMETERS_ROLE
 *      |     -> May set epoch parameters such as the interval, offset, and blackout window.
 *      |
 *      +-- REWARDS_RATE_ROLE
 *      |     -> May set the emission rate of rewards.
 *      |
 *      +-- CLAIM_OPERATOR_ROLE
 *      |     -> May claim rewards on behalf of a user.
 *      |
 *      +-- STAKE_OPERATOR_ROLE
 *            -> May manipulate user's staked funds (e.g. perform withdrawals on behalf of a user).
 */
abstract contract SM1Roles is SM1Storage {
  bytes32 public constant OWNER_ROLE = keccak256('OWNER_ROLE');
  bytes32 public constant SLASHER_ROLE = keccak256('SLASHER_ROLE');
  bytes32 public constant EPOCH_PARAMETERS_ROLE = keccak256('EPOCH_PARAMETERS_ROLE');
  bytes32 public constant REWARDS_RATE_ROLE = keccak256('REWARDS_RATE_ROLE');
  bytes32 public constant CLAIM_OPERATOR_ROLE = keccak256('CLAIM_OPERATOR_ROLE');
  bytes32 public constant STAKE_OPERATOR_ROLE = keccak256('STAKE_OPERATOR_ROLE');

  function __SM1Roles_init() internal {
    // Assign roles to the sender.
    //
    // The STAKE_OPERATOR_ROLE and CLAIM_OPERATOR_ROLE roles are not initially assigned.
    // These can be assigned to other smart contracts to provide additional functionality for users.
    _setupRole(OWNER_ROLE, msg.sender);
    _setupRole(SLASHER_ROLE, msg.sender);
    _setupRole(EPOCH_PARAMETERS_ROLE, msg.sender);
    _setupRole(REWARDS_RATE_ROLE, msg.sender);

    // Set OWNER_ROLE as the admin of all roles.
    _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
    _setRoleAdmin(SLASHER_ROLE, OWNER_ROLE);
    _setRoleAdmin(EPOCH_PARAMETERS_ROLE, OWNER_ROLE);
    _setRoleAdmin(REWARDS_RATE_ROLE, OWNER_ROLE);
    _setRoleAdmin(CLAIM_OPERATOR_ROLE, OWNER_ROLE);
    _setRoleAdmin(STAKE_OPERATOR_ROLE, OWNER_ROLE);
  }
}
