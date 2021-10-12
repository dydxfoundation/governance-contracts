// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

library MD1Types {

  /**
   * @dev The parameters used to convert a timestamp to an epoch number.
   */
  struct EpochParameters {
    uint128 interval;
    uint128 offset;
  }

  /**
   * @dev The parameters related to a certain version of the Merkle root.
   */
  struct MerkleRoot {
    bytes32 merkleRoot;
    uint256 epoch;
    bytes ipfsCid;
  }
}
