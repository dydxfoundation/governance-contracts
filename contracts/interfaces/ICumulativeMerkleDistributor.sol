// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

// Allows anyone to claim DYDX token if they exist in a merkle root.
interface ICumulativeMerkleDistributor {
  // Returns the address of DYDX token.
  function TOKEN() external view returns (address);

  // Returns the merkle root of the merkle tree containing account balances available to claim.
  function _merkleRoot() external view returns (bytes32);

  // sets the new merkle tree root for the next epoch
  function setNewRoot(
    bytes32 newMerkleRoot,
    bytes32 newContentHash,
    uint256 newEpoch
  ) external;

  // Claim the given (cumulativeAmount - rewardsAlreadyClaimed) of DYDX token to the given address. Reverts if the inputs are invalid
  // or there are no tokens for this user to claim.
  function claim(
    uint256 index,
    address account,
    uint256 cumulativeAmount,
    uint256 epoch,
    bytes32[] calldata merkleProof
  ) external;

  // This event is triggered whenever a call to #claim succeeds.
  event Claimed(uint256 index, address account, uint256 cumulativeAmount, uint256 epoch);
  // This event is triggered whenever the owner of this contract updates the merkle root.
  event RootUpdated(uint256 epoch, bytes32 root, bytes32 contentHash);
}
