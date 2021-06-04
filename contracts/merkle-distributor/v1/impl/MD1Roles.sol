pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {MD1Storage} from './MD1Storage.sol';

/**
 * @title MD1Roles
 * @author dYdX
 *
 * @notice Defines roles used in the MerkleDistributorV1 contract. The hierarchy of roles and
 *  powers of each role are described below.
 *
 *  Roles:
 *
 *    OWNER_ROLE
 *      | -> May add or remove users from any of the below roles it manages.
 *      | -> May update the rewards oracle address.
 *      | -> May update the epoch schedule.
 *      |
 *      +-- PAUSER_ROLE
 *      |     -> May pause updates to the Merkle root.
 *      |
 *      +-- UNPAUSER_ROLE
 *            -> May unpause updates to the Merkle root.
 */
abstract contract MD1Roles is MD1Storage {
  bytes32 public constant OWNER_ROLE = keccak256('OWNER_ROLE');
  bytes32 public constant PAUSER_ROLE = keccak256('PAUSER_ROLE');
  bytes32 public constant UNPAUSER_ROLE = keccak256('UNPAUSER_ROLE');

  function __MD1Roles_init() internal {
    // Assign roles to the sender.
    _setupRole(OWNER_ROLE, msg.sender);
    _setupRole(PAUSER_ROLE, msg.sender);
    _setupRole(UNPAUSER_ROLE, msg.sender);

    // Set OWNER_ROLE as the admin of all roles.
    _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
    _setRoleAdmin(PAUSER_ROLE, OWNER_ROLE);
    _setRoleAdmin(UNPAUSER_ROLE, OWNER_ROLE);
  }
}
