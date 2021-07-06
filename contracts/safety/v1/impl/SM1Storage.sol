pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {
  AccessControlUpgradeable
} from '../../../dependencies/open-zeppelin/AccessControlUpgradeable.sol';
import {ReentrancyGuard} from '../../../lib/ReentrancyGuard.sol';
import {VersionedInitializable} from '../../../utils/VersionedInitializable.sol';
import {SM1Types} from '../lib/SM1Types.sol';

/**
 * @title SM1Storage
 * @author dYdX
 *
 * @dev Storage contract. Contains or inherits from all contract with storage.
 */
abstract contract SM1Storage is AccessControlUpgradeable, ReentrancyGuard, VersionedInitializable {

  // ============ Constants ============

  uint256 public constant EXCHANGE_RATE_BASE = 1e18;

  // ============ Epoch Schedule ============

  /// @dev The parameters specifying the function from timestamp to epoch number.
  SM1Types.EpochParameters internal _EPOCH_PARAMETERS_;

  /// @dev The period of time at the end of each epoch in which withdrawals cannot be requested.
  uint256 internal _BLACKOUT_WINDOW_;

  // ============ Staked Token ERC20 ============

  mapping(address => mapping(address => uint256)) internal _ALLOWANCES_;

  // ============ Rewards Accounting ============

  /// @dev The emission rate of rewards.
  uint256 internal _REWARDS_PER_SECOND_;

  /// @dev The cumulative rewards earned per staked token.
  uint256 internal _GLOBAL_INDEX_;

  /// @dev The timestamp at which the global index was last updated.
  uint256 internal _GLOBAL_INDEX_TIMESTAMP_;

  /// @dev The value of the global index when the user's staked balance was last updated.
  mapping(address => uint256) internal _USER_INDEXES_;

  /// @dev The user's accrued, unclaimed rewards (as of the last update to the user index).
  mapping(address => uint256) internal _USER_REWARDS_BALANCES_;

  /// @dev The value of the global index at the end of a given epoch.
  mapping(uint256 => uint256) internal _EPOCH_INDEXES_;

  // ============ Staker Accounting ============

  /// @dev The active balance by staker.
  mapping(address => SM1Types.StoredBalance) internal _ACTIVE_BALANCES_;

  /// @dev The total active balance of stakers.
  SM1Types.StoredBalance internal _TOTAL_ACTIVE_BALANCE_;

  /// @dev The inactive balance by staker.
  mapping(address => SM1Types.StoredBalance) internal _INACTIVE_BALANCES_;

  /// @dev The total inactive balance of stakers.
  SM1Types.StoredBalance internal _TOTAL_INACTIVE_BALANCE_;

  // ============ Slash Accounting ============

  /// @dev The value of one underlying token, in the units used for staked balances, denominated
  ///  as a mutiple of EXCHANGE_RATE_BASE for additional precision.
  uint256 internal _EXCHANGE_RATE_;

  /// @dev Info about full slashes that have occurred. Each full slash resets the exchange rate.
  SM1Types.FullSlash[] internal _FULL_SLASHES_;
}
