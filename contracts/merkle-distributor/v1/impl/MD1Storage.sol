pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {
  AccessControlUpgradeable
} from '../../../dependencies/open-zeppelin/AccessControlUpgradeable.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { IRewardsOracle } from '../../../interfaces/IRewardsOracle.sol';
import {ReentrancyGuard} from '../../../lib/ReentrancyGuard.sol';
import {VersionedInitializable} from '../../../utils/VersionedInitializable.sol';
import {MD1Types} from '../lib/MD1Types.sol';

/**
 * @title MD1Storage
 * @author dYdX
 *
 * @dev Storage contract. Contains or inherits from all contract with storage.
 */
abstract contract MD1Storage is AccessControlUpgradeable, ReentrancyGuard, VersionedInitializable {

  /// @dev The parameters specifying the function from timestamp to epoch number.
  MD1Types.EpochParameters internal _EPOCH_PARAMETERS_;

  /// @dev The oracle which provides Merkle root updates.
  IRewardsOracle internal _REWARDS_ORACLE_;

  /// @dev The active Merkle root and related parameters.
  MD1Types.MerkleRoot internal _ACTIVE_ROOT_;

  /// @dev The proposed Merkle root and related parameters.
  MD1Types.MerkleRoot internal _PROPOSED_ROOT_;

  /// @dev The time at which the proposed root may become active.
  uint256 internal _WAITING_PERIOD_END_;

  /// @dev Whether root updates are currently paused.
  bool internal _ARE_ROOT_UPDATES_PAUSED_;

  /// @dev Mapping of (user address) => (number of tokens claimed).
  mapping(address => uint256) internal _CLAIMED_;
}
