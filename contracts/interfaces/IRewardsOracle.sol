// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

interface IRewardsOracle {

  /**
   * @notice Returns the oracle value, agreed upon by all oracle signers. If the signers have not
   *  agreed upon a value, should return zero for all return values.
   *
   * @return  merkleRoot  The Merkle root for the next Merkle distributor update.
   * @return  ipfsCid     An IPFS CID pointing to the Merkle tree data.
   * @return  epoch       The epoch number corresponding to the new Merkle root.
   */
  function read() external virtual view returns (bytes32 merkleRoot, bytes32 ipfsCid, uint256 epoch);
}
