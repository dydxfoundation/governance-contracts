// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { MerkleProof } from '../../../dependencies/open-zeppelin/MerkleProof.sol';
import { SafeERC20 } from '../../../dependencies/open-zeppelin/SafeERC20.sol';
import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { MD1Types } from '../lib/MD1Types.sol';
import { MD1Roles } from './MD1Roles.sol';

/**
 * @title MD1Claims
 * @author dYdX
 *
 * @notice Allows rewards to be claimed by providing a Merkle proof of the rewards amount.
 */
abstract contract MD1Claims is
  MD1Roles
{
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice The token distributed as rewards.
  IERC20 public immutable REWARDS_TOKEN;

  /// @notice Address to pull rewards from. Must have provided an allowance to this contract.
  address public immutable REWARDS_TREASURY;

  // ============ Events ============

  /// @notice Emitted when a user claims rewards.
  event RewardsClaimed(
    address account,
    uint256 amount
  );

  /// @notice Emitted when a user opts into or out of the claim-for allowlist.
  event AlwaysAllowClaimForUpdated(
    address user,
    bool allow
  );

  // ============ Constructor ============

  constructor(
    address rewardsToken,
    address rewardsTreasury
  ) {
    REWARDS_TOKEN = IERC20(rewardsToken);
    REWARDS_TREASURY = rewardsTreasury;
  }

  // ============ External Functions ============

  /**
   * @notice Claim the remaining unclaimed rewards for the sender.
   *
   *  Reverts if the provided Merkle proof is invalid.
   *
   * @param  cumulativeAmount  The total all-time rewards this user has earned.
   * @param  merkleProof       The Merkle proof for the user and cumulative amount.
   *
   * @return The number of rewards tokens claimed.
   */
  function claimRewards(
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    nonReentrant
    returns (uint256)
  {
    return _claimRewards(msg.sender, cumulativeAmount, merkleProof);
  }

  /**
   * @notice Claim the remaining unclaimed rewards for a user, and send them to that user.
   *
   *  The caller must be authorized with CLAIM_OPERATOR_ROLE unless the specified user has opted
   *  into the claim-for allowlist. In any case, rewards are transfered to the original user
   *  specified in the Merkle tree.
   *
   *  Reverts if the provided Merkle proof is invalid.
   *
   * @param  user              Address of the user on whose behalf to trigger a claim.
   * @param  cumulativeAmount  The total all-time rewards this user has earned.
   * @param  merkleProof       The Merkle proof for the user and cumulative amount.
   *
   * @return The number of rewards tokens claimed.
   */
  function claimRewardsFor(
    address user,
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    nonReentrant
    returns (uint256)
  {
    require(
      (
        hasRole(CLAIM_OPERATOR_ROLE, msg.sender) ||
        _ALWAYS_ALLOW_CLAIMS_FOR_[user]
      ),
      'MD1Claims: Do not have permission to claim for this user'
    );
    return _claimRewards(user, cumulativeAmount, merkleProof);
  }

  /**
   * @notice Opt into allowing anyone to claim on the sender's behalf.
   *
   *  Note that this does not affect who receives the funds. The user specified in the Merkle tree
   *  receives those rewards regardless of who issues the claim.
   *
   *  Note that addresses with the CLAIM_OPERATOR_ROLE ignore this allowlist when triggering claims.
   *
   * @param  allow  Whether or not to allow claims on the sender's behalf.
   */
  function setAlwaysAllowClaimsFor(
    bool allow
  )
    external
    nonReentrant
  {
    _ALWAYS_ALLOW_CLAIMS_FOR_[msg.sender] = allow;
    emit AlwaysAllowClaimForUpdated(msg.sender, allow);
  }

  // ============ Internal Functions ============

  /**
   * @notice Claim the remaining unclaimed rewards for a user, and send them to that user.
   *
   *  Reverts if the provided Merkle proof is invalid.
   *
   * @param  user              Address of the user.
   * @param  cumulativeAmount  The total all-time rewards this user has earned.
   * @param  merkleProof       The Merkle proof for the user and cumulative amount.
   *
   * @return The number of rewards tokens claimed.
   */
  function _claimRewards(
    address user,
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    internal
    returns (uint256)
  {
    // Get the active Merkle root.
    bytes32 merkleRoot = _ACTIVE_ROOT_.merkleRoot;

    // Verify the Merkle proof.
    bytes32 node = keccak256(abi.encodePacked(user, cumulativeAmount));
    require(
      MerkleProof.verify(merkleProof, merkleRoot, node),
      'MD1Claims: Invalid Merkle proof'
    );

    // Get the claimable amount.
    //
    // Note: If this reverts, then there was an error in the Merkle tree, since the cumulative
    // amount for a given user should never decrease over time.
    uint256 claimable = cumulativeAmount.sub(_CLAIMED_[user]);

    if (claimable == 0) {
      return 0;
    }

    // Mark the user as having claimed the full amount.
    _CLAIMED_[user] = cumulativeAmount;

    // Send the user the claimable amount.
    REWARDS_TOKEN.safeTransferFrom(REWARDS_TREASURY, user, claimable);

    emit RewardsClaimed(user, claimable);

    return claimable;
  }
}
