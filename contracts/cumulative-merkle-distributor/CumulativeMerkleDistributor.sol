// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import { IERC20 } from '../interfaces/IERC20.sol';
import { ICumulativeMerkleDistributor } from '../interfaces/ICumulativeMerkleDistributor.sol';
import { SafeMath } from '../dependencies/open-zeppelin/SafeMath.sol';
import { Ownable } from '../dependencies/open-zeppelin/Ownable.sol';
import { MerkleProof } from '../dependencies/open-zeppelin/MerkleProof.sol';

/**
 * @notice The dYdX cumulative merkle distributor for rewards. Anyone can claim DYDX token as long as they exist
 * in the merkle root and have not claimed all tokens.
 * @author dYdX
 */
contract CumulativeMerkleDistributor is ICumulativeMerkleDistributor, Ownable {
    using SafeMath for uint256;

    /// @dev token address meant to be distributed as rewards
    address public immutable override TOKEN;
    /// @dev root of merkle tree
    bytes32 public override _merkleRoot;
    /// @dev current rewards epoch
    uint256 public _epoch;

    /// @dev mapping of (user address) => (# of tokens claimed), so we can remember how many tokens a user has
    /// claimed from previous epochs.
    mapping(address => uint256) public claimed;

    constructor(address token_) public {
        TOKEN = token_;
    }

    /**
     * @dev Sets the merkle root and next epoch. Only callable by the owner of the contract. Reverts
     * if newMerkleRoot is the same as the current one, or if the epoch is not 1 greater than the current.
     * @param newMerkleRoot Merkle root of the merkle tree representing the latest epoch.
     * @param newContentHash IPFS content hash of the merkle tree representing the latest epoch.
     * @param newEpoch Epoch number of the latest epoch.
     */
    function setNewRoot(
        bytes32 newMerkleRoot,
        bytes32 newContentHash,
        uint256 newEpoch
    ) external override onlyOwner {
        require(_epoch + 1 == newEpoch, "INVALID_NEW_EPOCH");
        require(_merkleRoot != newMerkleRoot, "SAME_MERKLE_ROOT");

        _merkleRoot = newMerkleRoot;
        _epoch = newEpoch;

        emit RootUpdated(newEpoch, newMerkleRoot, newContentHash);
    }

    /**
     * @dev Claims remaining unclaimed rewards for an account. Reverts if the merkle root is set to bytes32(0), the epoch is incorrect,
     the merkle proof is invalid, the user has claimed all earned rewards, or if the token transfer to the user fails.
     * @param index Index of the account in the merkle tree.
     * @param account Address of the account.
     * @param cumulativeAmount The total rewards this user has earned.
     * @param epoch The current epoch.
     * @param merkleProof The merkle proof data.
     */
    function claim(
        uint256 index,
        address account,
        uint256 cumulativeAmount,
        uint256 epoch,
        bytes32[] calldata merkleProof
    ) external override {
        bytes32 merkleRoot = _merkleRoot;
        require(merkleRoot != bytes32(0), "MERKLE_DISTRIBUTOR_ROOT_NOT_SET");

        // Verify the merkle proof
        bytes32 node = keccak256(abi.encodePacked(index, account, cumulativeAmount, epoch));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'MERKLE_DISTRIBUTOR_INVALID_PROOF');

        // Mark user address as having claimed `cumulativeAmount`
        uint256 claimable = cumulativeAmount.sub(claimed[account]);
        require(claimable > 0, "MERKLE_DISTRIBUTOR_NOTHING_TO_CLAIM");
        claimed[account] = cumulativeAmount;

        // Send the user the remaining amount they haven't claimed yet
        require(IERC20(TOKEN).transfer(account, claimable), 'MERKLE_DISTRIBUTOR_TRANSFER_FAILED');

        emit Claimed(index, account, claimable, epoch);
    }
}
