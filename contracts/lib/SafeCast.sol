// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

/**
 * @dev Methods for downcasting unsigned integers, reverting on overflow.
 */
library SafeCast {
  /**
   * @dev Downcase to a uint16, reverting on overflow.
   */
  function toUint16(uint256 a) internal pure returns (uint16) {
    uint16 b = uint16(a);
    require(uint256(b) == a, 'SafeCast: toUint16 overflow');
    return b;
  }

  /**
   * @dev Downcase to a uint80, reverting on overflow.
   */
  function toUint80(uint256 a) internal pure returns (uint80) {
    uint80 b = uint80(a);
    require(uint256(b) == a, 'SafeCast: toUint80 overflow');
    return b;
  }

  /**
   * @dev Downcase to a uint96, reverting on overflow.
   */
  function toUint96(uint256 a) internal pure returns (uint96) {
    uint96 b = uint96(a);
    require(uint256(b) == a, 'SafeCast: toUint96 overflow');
    return b;
  }

  /**
   * @dev Downcase to a uint112, reverting on overflow.
   */
  function toUint112(uint256 a) internal pure returns (uint112) {
    uint112 b = uint112(a);
    require(uint256(b) == a, 'SafeCast: toUint112 overflow');
    return b;
  }

  /**
   * @dev Downcase to a uint120, reverting on overflow.
   */
  function toUint120(uint256 a) internal pure returns (uint120) {
    uint120 b = uint120(a);
    require(uint256(b) == a, 'SafeCast: toUint120 overflow');
    return b;
  }

  /**
   * @dev Downcase to a uint128, reverting on overflow.
   */
  function toUint128(uint256 a) internal pure returns (uint128) {
    uint128 b = uint128(a);
    require(uint256(b) == a, 'SafeCast: toUint128 overflow');
    return b;
  }

  /**
   * @dev Downcase to a uint240, reverting on overflow.
   */
  function toUint240(uint256 a) internal pure returns (uint240) {
    uint240 b = uint240(a);
    require(uint256(b) == a, 'SafeCast: toUint240 overflow');
    return b;
  }
}
