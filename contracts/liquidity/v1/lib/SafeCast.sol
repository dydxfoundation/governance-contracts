// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

/**
 * @title SafeCast
 * @author dYdX
 *
 * @dev Methods for downcasting unsigned integers, reverting on overflow.
 */
library SafeCast {

  /**
   * @dev Downcast to a uint16, reverting on overflow.
   */
  function toUint16(
    uint256 a
  )
    internal
    pure
    returns (uint16)
  {
    uint16 b = uint16(a);
    require(uint256(b) == a, 'SafeCast: toUint16 overflow');
    return b;
  }

  /**
   * @dev Downcast to a uint32, reverting on overflow.
   */
  function toUint32(
    uint256 a
  )
    internal
    pure
    returns (uint32)
  {
    uint32 b = uint32(a);
    require(uint256(b) == a, 'SafeCast: toUint32 overflow');
    return b;
  }

  /**
   * @dev Downcast to a uint112, reverting on overflow.
   */
  function toUint112(
    uint256
  a)
    internal
    pure
    returns (uint112)
  {
    uint112 b = uint112(a);
    require(uint256(b) == a, 'SafeCast: toUint112 overflow');
    return b;
  }

  /**
   * @dev Downcast to a uint120, reverting on overflow.
   */
  function toUint120(
    uint256
  a)
    internal
    pure
    returns (uint120)
  {
    uint120 b = uint120(a);
    require(uint256(b) == a, 'SafeCast: toUint120 overflow');
    return b;
  }

  /**
   * @dev Downcast to a uint128, reverting on overflow.
   */
  function toUint128(
    uint256
  a)
    internal
    pure
    returns (uint128)
  {
    uint128 b = uint128(a);
    require(uint256(b) == a, 'SafeCast: toUint128 overflow');
    return b;
  }

  /**
   * @dev Downcast to a uint224, reverting on overflow.
   */
  function toUint224(
    uint256
  a)
    internal
    pure
    returns (uint224)
  {
    uint224 b = uint224(a);
    require(uint256(b) == a, 'SafeCast: toUint224 overflow');
    return b;
  }
}
