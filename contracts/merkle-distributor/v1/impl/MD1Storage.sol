// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import {
  AccessControlUpgradeable
} from '../../../dependencies/open-zeppelin/AccessControlUpgradeable.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { IRewardsOracle } from '../../../interfaces/IRewardsOracle.sol';
import { ReentrancyGuard } from '../../../utils/ReentrancyGuard.sol';
import { VersionedInitializable } from '../../../utils/VersionedInitializable.sol';
import { MD1Types } from '../lib/MD1Types.sol';

/**
 * @title MD1Storage
 * @author dYdX
 *
 * @dev Storage contract. Contains or inherits from all contract with storage.
 */
abstract contract MD1Storage is
  AccessControlUpgradeable,
  ReentrancyGuard,
  VersionedInitializable
{
  // ============ Configuration ============

  /// @dev The oracle which provides Merkle root updates.
  IRewardsOracle internal _REWARDS_ORACLE_;

  /// @dev The IPNS name to which trader and market maker exchange statistics are published.
  string internal _IPNS_NAME_;

  /// @dev Period of time after the epoch end after which the new epoch exchange statistics should
  ///  be available on IPFS via the IPNS name. This can be used as a trigger for “keepers” who are
  ///  incentivized to call the proposeRoot() and updateRoot() functions as needed.
  uint256 internal _IPFS_UPDATE_PERIOD_;

  /// @dev Max rewards distributed per epoch as market maker incentives.
  uint256 internal _MARKET_MAKER_REWARDS_AMOUNT_;

  /// @dev Max rewards distributed per epoch as trader incentives.
  uint256 internal _TRADER_REWARDS_AMOUNT_;

  /// @dev Parameter affecting the calculation of trader rewards. This is a value
  ///  between 0 and 1, represented here in units out of 10^18.
  uint256 internal _TRADER_SCORE_ALPHA_;

  // ============ Epoch Schedule ============

  /// @dev The parameters specifying the function from timestamp to epoch number.
  MD1Types.EpochParameters internal _EPOCH_PARAMETERS_;

  // ============ Root Updates ============

  /// @dev The active Merkle root and associated parameters.
  MD1Types.MerkleRoot internal _ACTIVE_ROOT_;

  /// @dev The proposed Merkle root and associated parameters.
  MD1Types.MerkleRoot internal _PROPOSED_ROOT_;

  /// @dev The time at which the proposed root may become active.
  uint256 internal _WAITING_PERIOD_END_;

  /// @dev Whether root updates are currently paused.
  bool internal _ARE_ROOT_UPDATES_PAUSED_;

  // ============ Claims ============

  /// @dev Mapping of (user address) => (number of tokens claimed).
  mapping(address => uint256) internal _CLAIMED_;

  /// @dev Whether the user has opted into allowing anyone to trigger a claim on their behalf.
  mapping(address => bool) internal _ALWAYS_ALLOW_CLAIMS_FOR_;
}
