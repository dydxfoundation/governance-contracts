// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { MerkleProof } from '../../../dependencies/open-zeppelin/MerkleProof.sol';
import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { MD1Types } from '../lib/MD1Types.sol';
import { MD1Pausable } from './MD1Pausable.sol';

/**
 * @title MD1RootUpdates
 * @author dYdX
 *
 * @notice Handles updates to the Merkle root.
 */
abstract contract MD1RootUpdates is
  MD1Pausable
{
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice The waiting period before a proposed Merkle root can become active, in seconds.
  uint256 public constant WAITING_PERIOD = 7 days;

  // ============ Events ============

  /// @notice Emitted when a new Merkle root is proposed and the waiting period begins.
  event RootProposed(
    bytes32 merkleRoot,
    uint256 epoch,
    bytes ipfsCid,
    uint256 waitingPeriodEnd
  );

  /// @notice Emitted when a new Merkle root becomes active.
  event RootUpdated(
    bytes32 merkleRoot,
    uint256 epoch,
    bytes ipfsCid
  );

  // ============ External Functions ============

  /**
   * @notice Set the proposed root parameters to the values returned by the oracle, and start the
   *  waiting period. Anyone may call this function.
   *
   *  Reverts if the oracle root is bytes32(0).
   *  Reverts if the oracle root parameters are equal to the proposed root parameters.
   *  Reverts if the oracle root epoch is not equal to the next root epoch.
   */
  function proposeRoot()
    external
    nonReentrant
  {
    // Read the latest values from the oracle.
    (
      bytes32 merkleRoot,
      uint256 epoch,
      bytes memory ipfsCid
    ) = _REWARDS_ORACLE_.read();

    require(
      merkleRoot != bytes32(0),
      'MD1RootUpdates: Oracle root is zero (unset)'
    );
    require(
      (
        merkleRoot != _PROPOSED_ROOT_.merkleRoot ||
        epoch != _PROPOSED_ROOT_.epoch ||
        keccak256(ipfsCid) != keccak256(_PROPOSED_ROOT_.ipfsCid)
      ),
      'MD1RootUpdates: Oracle root was already proposed'
    );
    require(
      epoch == getNextRootEpoch(),
      'MD1RootUpdates: Oracle epoch is not next root epoch'
    );

    // Set the proposed root and the waiting period for the proposed root to become active.
    _PROPOSED_ROOT_ = MD1Types.MerkleRoot({
      merkleRoot: merkleRoot,
      epoch: epoch,
      ipfsCid: ipfsCid
    });
    uint256 waitingPeriodEnd = block.timestamp.add(WAITING_PERIOD);
    _WAITING_PERIOD_END_ = waitingPeriodEnd;

    emit RootProposed(merkleRoot, epoch, ipfsCid, waitingPeriodEnd);
  }

  /**
   * @notice Set the active root parameters to the proposed root parameters.
   *
   *  Reverts if root updates are paused.
   *  Reverts if the proposed root is bytes32(0).
   *  Reverts if the proposed root epoch is not equal to the next root epoch.
   *  Reverts if the waiting period for the proposed root has not elapsed.
   */
  function updateRoot()
    external
    nonReentrant
    whenNotPaused
  {
    // Get the proposed root parameters.
    bytes32 merkleRoot = _PROPOSED_ROOT_.merkleRoot;
    uint256 epoch = _PROPOSED_ROOT_.epoch;
    bytes memory ipfsCid = _PROPOSED_ROOT_.ipfsCid;

    require(
      merkleRoot != bytes32(0),
      'MD1RootUpdates: Proposed root is zero (unset)'
    );
    require(
      epoch == getNextRootEpoch(),
      'MD1RootUpdates: Proposed epoch is not next root epoch'
    );
    require(
      block.timestamp >= _WAITING_PERIOD_END_,
      'MD1RootUpdates: Waiting period has not elapsed'
    );

    // Set the active root.
    _ACTIVE_ROOT_.merkleRoot = merkleRoot;
    _ACTIVE_ROOT_.epoch = epoch;
    _ACTIVE_ROOT_.ipfsCid = ipfsCid;

    emit RootUpdated(merkleRoot, epoch, ipfsCid);
  }

  /**
   * @notice Returns true if there is a proposed root waiting to become active, the waiting period
   *  for that root has elapsed, and root updates are not paused.
   *
   * @return Boolean `true` if the active root can be updated to the proposed root, else `false`.
   */
  function canUpdateRoot()
    external
    view
    returns (bool)
  {
    return (
      hasPendingRoot() &&
      block.timestamp >= _WAITING_PERIOD_END_ &&
      !_ARE_ROOT_UPDATES_PAUSED_
    );
  }

  // ============ Public Functions ============

  /**
   * @notice Returns true if there is a proposed root waiting to become active. This is the case if
   *  and only if the proposed root is not zero and the proposed root epoch is equal to the next
   *  root epoch.
   */
  function hasPendingRoot()
    public
    view
    returns (bool)
  {
    // Get the proposed parameters.
    bytes32 merkleRoot = _PROPOSED_ROOT_.merkleRoot;
    uint256 epoch = _PROPOSED_ROOT_.epoch;

    if (merkleRoot == bytes32(0)) {
      return false;
    }
    return epoch == getNextRootEpoch();
  }

  /**
   * @notice Get the next root epoch. If the active root is zero, then the next root epoch is zero,
   *  otherwise, it is equal to the active root epoch plus one.
   */
  function getNextRootEpoch()
    public
    view
    returns (uint256)
  {
    bytes32 merkleRoot = _ACTIVE_ROOT_.merkleRoot;

    if (merkleRoot == bytes32(0)) {
      return 0;
    }

    return _ACTIVE_ROOT_.epoch.add(1);
  }
}
