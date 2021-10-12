// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { SafeERC20 } from '../dependencies/open-zeppelin/SafeERC20.sol';
import { IERC20 } from '../interfaces/IERC20.sol';

interface IMerkleDistributorV1 {
  function claimRewards(
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    returns (uint256);
}

/**
 * @title  TreasuryMerkleClaimProxy
 * @author dYdX
 *
 * @notice Contract which claims DYDX rewards from the merkle distributor and immediately
 *         transfers the rewards to the community treasury.
 *
 *         This contract is meant to be used for transferring all unclaimed epoch zero retroactive
 *         mining rewards to the community treasury.
 */
contract TreasuryMerkleClaimProxy {
  using SafeERC20 for IERC20;

  // ============ Constants ============

  IMerkleDistributorV1 public immutable MERKLE_DISTRIBUTOR;

  /// @notice Address to send claimed merkle rewards to.
  address public immutable COMMUNITY_TREASURY;

  IERC20 public immutable REWARDS_TOKEN;

  // ============ Constructor ============

  constructor(
    IMerkleDistributorV1 merkleDistributor,
    address communityTreasury,
    IERC20 rewardsToken
  ) {
    MERKLE_DISTRIBUTOR = merkleDistributor;
    COMMUNITY_TREASURY = communityTreasury;
    REWARDS_TOKEN = rewardsToken;
  }

  // ============ External Functions ============

  /**
   * @notice Claims rewards from merkle distributor and forwards them to the community treasury.
   *
   * @param  merkleCumulativeAmount   The cumulative rewards amount owned by this proxy on behalf
   *                                  of the treasury, in the MerkleDistributorV1 rewards tree.
   * @param  merkleProof              The Merkle proof to claim rewards for this proxy on behalf
   *                                  of the treasury.
   *
   * @return The total number of rewards claimed and transferred to the community treasury.
   */
  function claimRewards(
    uint256 merkleCumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    returns (uint256)
  {
    uint256 claimedRewards = MERKLE_DISTRIBUTOR.claimRewards(merkleCumulativeAmount, merkleProof);

    REWARDS_TOKEN.safeTransfer(COMMUNITY_TREASURY, claimedRewards);

    return claimedRewards;
  }
}
