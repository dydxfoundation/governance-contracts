// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { MD1Storage } from './MD1Storage.sol';

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
 *      | -> May add or remove addresses from any of the below roles it manages.
 *      | -> May update the rewards oracle address.
 *      | -> May update the IPNS name.
 *      |
 *      +-- CONFIG_UPDATER_ROLE
 *      |     -> May update parameters affecting the formulae used to calculate rewards.
 *      |     -> May update the epoch schedule.
 *      |     -> May update the IPFS update period.
 *      |
 *      +-- PAUSER_ROLE
 *      |     -> May pause updates to the Merkle root.
 *      |
 *      +-- UNPAUSER_ROLE
 *      |     -> May unpause updates to the Merkle root.
 *      |
 *      +-- CLAIM_OPERATOR_ROLE
 *            -> May trigger a claim on behalf of a user (but the recipient is always the user).
 */
abstract contract MD1Roles is
  MD1Storage
{
  bytes32 public constant OWNER_ROLE = keccak256('OWNER_ROLE');
  bytes32 public constant CONFIG_UPDATER_ROLE = keccak256('CONFIG_UPDATER_ROLE');
  bytes32 public constant PAUSER_ROLE = keccak256('PAUSER_ROLE');
  bytes32 public constant UNPAUSER_ROLE = keccak256('UNPAUSER_ROLE');
  bytes32 public constant CLAIM_OPERATOR_ROLE = keccak256('CLAIM_OPERATOR_ROLE');

  function __MD1Roles_init()
    internal
  {
    // Assign the OWNER_ROLE to the sender.
    _setupRole(OWNER_ROLE, msg.sender);

    // Set OWNER_ROLE as the admin of all roles.
    _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
    _setRoleAdmin(CONFIG_UPDATER_ROLE, OWNER_ROLE);
    _setRoleAdmin(PAUSER_ROLE, OWNER_ROLE);
    _setRoleAdmin(UNPAUSER_ROLE, OWNER_ROLE);
    _setRoleAdmin(CLAIM_OPERATOR_ROLE, OWNER_ROLE);
  }
}
