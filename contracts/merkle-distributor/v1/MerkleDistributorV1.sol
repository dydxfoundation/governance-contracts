// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { MerkleProof } from '../../dependencies/open-zeppelin/MerkleProof.sol';
import { Ownable } from '../../dependencies/open-zeppelin/Ownable.sol';
import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { IRewardsOracle } from '../../interfaces/IRewardsOracle.sol';
import { MD1Claims } from './impl/MD1Claims.sol';
import { MD1Configuration } from './impl/MD1Configuration.sol';
import { MD1Getters } from './impl/MD1Getters.sol';
import { MD1RootUpdates } from './impl/MD1RootUpdates.sol';

/**
 * @title MerkleDistributorV1
 * @author dYdX
 *
 * @notice Distributes DYDX token rewards according to a Merkle tree of balances. The tree can be
 *  updated periodially with each user's cumulative rewards balance, allowing new rewards to be
 *  distributed to users over time.
 *
 *  An update is performed by setting the proposed Merkle root to the latest value returned by
 *  the oracle contract. The proposed Merkle root can be made active after a waiting period has
 *  elapsed. During the waiting period, dYdX governance has the opportunity to freeze the Merkle
 *  root, in case the proposed root is incorrect or malicious.
 */
contract MerkleDistributorV1 is
  MD1RootUpdates,
  MD1Claims,
  MD1Configuration,
  MD1Getters
{
  // ============ Constructor ============

  constructor(
    address rewardsToken,
    address rewardsTreasury
  )
    MD1Claims(rewardsToken, rewardsTreasury)
    {}

  // ============ External Functions ============

  function initialize(
    address rewardsOracle,
    string calldata ipnsName,
    uint256 ipfsUpdatePeriod,
    uint256 marketMakerRewardsAmount,
    uint256 traderRewardsAmount,
    uint256 traderScoreAlpha,
    uint256 epochInterval,
    uint256 epochOffset
  )
    external
    initializer
  {
    __MD1Roles_init();
    __MD1Configuration_init(
      rewardsOracle,
      ipnsName,
      ipfsUpdatePeriod,
      marketMakerRewardsAmount,
      traderRewardsAmount,
      traderScoreAlpha
    );
    __MD1EpochSchedule_init(epochInterval, epochOffset);
  }

  // ============ Internal Functions ============

  /**
   * @dev Returns the revision of the implementation contract. Used by VersionedInitializable.
   *
   * @return The revision number.
   */
  function getRevision()
    internal
    pure
    override
    returns (uint256)
  {
    return 1;
  }
}
