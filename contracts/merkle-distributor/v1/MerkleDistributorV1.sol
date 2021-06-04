// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { Ownable } from '../../dependencies/open-zeppelin/Ownable.sol';
import { MerkleProof } from '../../dependencies/open-zeppelin/MerkleProof.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { IRewardsOracle } from '../../interfaces/IRewardsOracle.sol';
import { MD1Logic } from './impl/MD1Logic.sol';
import { MD1Owner } from './impl/MD1Owner.sol';
import { MD1Getters } from './impl/MD1Getters.sol';

/**
 * @title MerkleDistributorV1
 * @author dYdX
 *
 * @notice Distributes DYDX token rewards according to a Merkle tree of balances. The tree can be
 *  updated periodially with each user's cumulative reward balance, allowing new rewards to be
 *  distributed to users over time.
 *
 *  An update is performed by setting the proposed Merkle root to the latest value returned by
 *  the oracle contract. The proposed Merkle root can be made active after a waiting period has
 *  elapsed. During the waiting period, dYdX governance has the opportunity to freeze the Merkle
 *  root, in case the proposed root is incorrect or malicious.
 */
contract MerkleDistributorV1 is MD1Logic, MD1Owner, MD1Getters {

  // ============ Constructor ============

  constructor(address rewardsToken, address rewardsVault)
    MD1Logic(rewardsToken, rewardsVault)
    {}

  // ============ External Functions ============

  function initialize(
    address rewardsOracle,
    uint256 interval,
    uint256 offset
  )
    external
    initializer
  {
    _setRewardsOracle(rewardsOracle);
    __MD1Roles_init();
    __MD1EpochSchedule_init(interval, offset);
  }

  // ============ Internal Functions ============

  /**
   * @dev Returns the revision of the implementation contract.
   *
   * @return The revision number.
   */
  function getRevision() internal pure override returns (uint256) {
    return 1;
  }
}
