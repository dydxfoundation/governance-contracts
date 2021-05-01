pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {
  AccessControlUpgradeable
} from '../../../dependencies/open-zeppelin/AccessControlUpgradeable.sol';
import {ReentrancyGuard} from '../../../lib/ReentrancyGuard.sol';
import {VersionedInitializable} from '../../../utils/VersionedInitializable.sol';

/**
 * @title SP1Storage
 * @author dYdX
 *
 * @notice Storage contract. Contains or inherits from all contracts with storage.
 */
abstract contract SP1Storage is AccessControlUpgradeable, ReentrancyGuard, VersionedInitializable {
  // ============ Modifiers ============

  /**
   * @dev Modifier to ensure the STARK key is allowed.
   */
  modifier onlyAllowedKey(uint256 starkKey) {
    require(_ALLOWED_STARK_KEYS_[starkKey], 'SP1Storage: STARK key is not on the allowlist');
    _;
  }

  /**
   * @dev Modifier to ensure the recipient is allowed.
   */
  modifier onlyAllowedRecipient(address recipient) {
    require(_ALLOWED_RECIPIENTS_[recipient], 'SP1Storage: Recipient is not on the allowlist');
    _;
  }

  // ============ Storage ============

  mapping(uint256 => bool) _ALLOWED_STARK_KEYS_;

  mapping(address => bool) _ALLOWED_RECIPIENTS_;

  /// @dev Note that this is different from _IS_BORROWING_RESTRICTED_ in LiquidityStakingV1.
  bool public _IS_BORROWING_RESTRICTED_;
}
