// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SM1Types } from '../lib/SM1Types.sol';
import { SM1Storage } from './SM1Storage.sol';

/**
 * @title SM1Snapshots
 * @author dYdX
 *
 * @dev Handles storage and retrieval of historical values by block number.
 *
 *  Note that the snapshot stored at a given block number represents the value as of the end of
 *  that block.
 */
abstract contract SM1Snapshots {

  /**
   * @dev Writes a snapshot of a value at the current block.
   *
   * @param  snapshots      Storage mapping from snapshot index to snapshot struct.
   * @param  snapshotCount  The total number of snapshots in the provided mapping.
   * @param  newValue       The new value to snapshot at the current block.
   *
   * @return The new snapshot count.
   */
  function _writeSnapshot(
    mapping(uint256 => SM1Types.Snapshot) storage snapshots,
    uint256 snapshotCount,
    uint256 newValue
  )
    internal
    returns (uint256)
  {
    uint256 currentBlock = block.number;

    if (
      snapshotCount != 0 &&
      snapshots[snapshotCount - 1].blockNumber == currentBlock
    ) {
      // If there was a previous snapshot for this block, overwrite it.
      snapshots[snapshotCount - 1].value = newValue;
      return snapshotCount;
    } else {
      snapshots[snapshotCount] = SM1Types.Snapshot(currentBlock, newValue);
      return snapshotCount + 1;
    }
  }

  /**
   * @dev Search for the snapshot value at a given block. Uses binary search.
   *
   *  Reverts if `blockNumber` is greater than the current block number.
   *
   * @param  snapshots      Storage mapping from snapshot index to snapshot struct.
   * @param  snapshotCount  The total number of snapshots in the provided mapping.
   * @param  blockNumber    The block number to search for.
   * @param  initialValue   The value to return if `blockNumber` is before the earliest snapshot.
   *
   * @return The snapshot value at the specified block number.
   */
  function _findValueAtBlock(
    mapping(uint256 => SM1Types.Snapshot) storage snapshots,
    uint256 snapshotCount,
    uint256 blockNumber,
    uint256 initialValue
  )
    internal
    view
    returns (uint256)
  {
    require(
      blockNumber <= block.number,
      'SM1Snapshots: INVALID_BLOCK_NUMBER'
    );

    if (snapshotCount == 0) {
      return initialValue;
    }

    // Check earliest snapshot.
    if (blockNumber < snapshots[0].blockNumber) {
      return initialValue;
    }

    // Check latest snapshot.
    if (blockNumber >= snapshots[snapshotCount - 1].blockNumber) {
      return snapshots[snapshotCount - 1].value;
    }

    uint256 lower = 0;
    uint256 upper = snapshotCount - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // Ceil, avoiding overflow.
      SM1Types.Snapshot memory snapshot = snapshots[center];
      if (snapshot.blockNumber == blockNumber) {
        return snapshot.value;
      } else if (snapshot.blockNumber < blockNumber) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return snapshots[lower].value;
  }
}
