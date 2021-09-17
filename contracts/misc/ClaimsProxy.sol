// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { SafeMath } from '../dependencies/open-zeppelin/SafeMath.sol';

interface ISafetyModuleV1 {
  function claimRewardsFor(
    address staker,
    address recipient
  )
    external
    returns (uint256);
}

interface ILiquidityStakingV1 {
  function claimRewardsFor(
    address staker,
    address recipient
  )
    external
    returns (uint256);
}

interface IMerkleDistributorV1 {
  function claimRewardsFor(
    address user,
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    returns (uint256);
}

interface ITreasuryVester {
  function claim()
    external;
}

/**
 * @title ClaimsProxy
 * @author dYdX
 *
 * @notice Contract which claims DYDX rewards from multiple contracts on behalf of a user.
 *
 *  Requires the following permissions:
 *    - Has role CLAIM_OPERATOR_ROLE on the SafetyModuleV1 contract.
 *    - Has role CLAIM_OPERATOR_ROLE on the LiquidityStakingV1 contract.
 *    - Has role CLAIM_OPERATOR_ROLE on the MerkleDistributorV1 contract.
 */
contract ClaimsProxy {
  using SafeMath for uint256;

  // ============ Constants ============

  ISafetyModuleV1 public immutable SAFETY_MODULE;
  ILiquidityStakingV1 public immutable LIQUIDITY_STAKING;
  IMerkleDistributorV1 public immutable MERKLE_DISTRIBUTOR;
  ITreasuryVester public immutable REWARDS_TREASURY_VESTER;

  // ============ Constructor ============

  constructor(
    ISafetyModuleV1 safetyModule,
    ILiquidityStakingV1 liquidityStaking,
    IMerkleDistributorV1 merkleDistributor,
    ITreasuryVester rewardsTreasuryVester
  ) {
    SAFETY_MODULE = safetyModule;
    LIQUIDITY_STAKING = liquidityStaking;
    MERKLE_DISTRIBUTOR = merkleDistributor;
    REWARDS_TREASURY_VESTER = rewardsTreasuryVester;
  }

  // ============ External Functions ============

  /**
   * @notice Claim rewards from zero or more rewards contracts. All rewards are sent directly to
   *  the sender's address.
   *
   * @param  claimSafetyRewards       Whether or not to claim rewards from the Safety Module.
   * @param  claimLiquidityRewards    Whether or not to claim rewards from the Liquidity Module.
   * @param  merkleCumulativeAmount   The cumulative rewards amount for the user in the
   *                                  Merkle distributor Merkle tree, or zero to skip claiming
   *                                  from this contract.
   * @param  merkleProof              The Merkle proof for the user's cumulative rewards.
   * @param  vestFromTreasuryVester   Whether or not to vest rewards from the rewards treasury
   *                                  vester to the rewards treasury (e.g. set to `true` if the
   *                                  rewards treasury has insufficient funds for the claim).
   *
   * @return The total number of rewards claimed.
   */
  function claimRewards(
    bool claimSafetyRewards,
    bool claimLiquidityRewards,
    uint256 merkleCumulativeAmount,
    bytes32[] calldata merkleProof,
    bool vestFromTreasuryVester
  )
    external
    returns (uint256)
  {
    if (vestFromTreasuryVester) {
      // Call rewards treasury vester to ensure the rewards treasury has sufficient funds.
      REWARDS_TREASURY_VESTER.claim();
    }

    address user = msg.sender;

    uint256 amount1 = 0;
    uint256 amount2 = 0;
    uint256 amount3 = 0;

    if (claimSafetyRewards) {
      amount1 = SAFETY_MODULE.claimRewardsFor(user, user);
    }
    if (claimLiquidityRewards) {
      amount2 = LIQUIDITY_STAKING.claimRewardsFor(user, user);
    }
    if (merkleCumulativeAmount != 0) {
      amount3 = MERKLE_DISTRIBUTOR.claimRewardsFor(user, merkleCumulativeAmount, merkleProof);
    }

    return amount1.add(amount2).add(amount3);
  }
}
