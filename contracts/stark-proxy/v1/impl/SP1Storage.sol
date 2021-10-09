// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import {
  AccessControlUpgradeable
} from '../../../dependencies/open-zeppelin/AccessControlUpgradeable.sol';
import { ReentrancyGuard } from '../../../utils/ReentrancyGuard.sol';
import { VersionedInitializable } from '../../../utils/VersionedInitializable.sol';

/**
 * @title SP1Storage
 * @author dYdX
 *
 * @dev Storage contract. Contains or inherits from all contracts with storage.
 */
abstract contract SP1Storage is
  AccessControlUpgradeable,
  ReentrancyGuard,
  VersionedInitializable
{
  // ============ Modifiers ============

  /**
   * @dev Modifier to ensure the STARK key is allowed.
   */
  modifier onlyAllowedKey(
    uint256 starkKey
  ) {
    require(_ALLOWED_STARK_KEYS_[starkKey], 'SP1Storage: STARK key is not on the allowlist');
    _;
  }

  /**
   * @dev Modifier to ensure the recipient is allowed.
   */
  modifier onlyAllowedRecipient(
    address recipient
  ) {
    require(_ALLOWED_RECIPIENTS_[recipient], 'SP1Storage: Recipient is not on the allowlist');
    _;
  }

  // ============ Storage ============

  mapping(uint256 => bool) internal _ALLOWED_STARK_KEYS_;

  mapping(address => bool) internal _ALLOWED_RECIPIENTS_;

  /// @dev Note that withdrawals are always permitted if the amount is in excess of the borrowed
  ///  amount. Also, this approval only applies to the primary ERC20 token, `TOKEN`.
  uint256 internal _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_;

  /// @dev Note that this is different from _IS_BORROWING_RESTRICTED_ in LiquidityStakingV1.
  bool internal _IS_BORROWING_RESTRICTED_;

  /// @dev Mapping from args hash to timestamp.
  mapping(bytes32 => uint256) internal _QUEUED_FORCED_TRADE_TIMESTAMPS_;
}
