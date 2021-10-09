// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

/**
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
    require(
      uint256(b) == a,
      'SafeCast: toUint16 overflow'
    );
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
    require(
      uint256(b) == a,
      'SafeCast: toUint32 overflow'
    );
    return b;
  }

  /**
   * @dev Downcast to a uint128, reverting on overflow.
   */
  function toUint128(
    uint256 a
  )
    internal
    pure
    returns (uint128)
  {
    uint128 b = uint128(a);
    require(
      uint256(b) == a,
      'SafeCast: toUint128 overflow'
    );
    return b;
  }

  /**
   * @dev Downcast to a uint224, reverting on overflow.
   */
  function toUint224(
    uint256 a
  )
    internal
    pure
    returns (uint224)
  {
    uint224 b = uint224(a);
    require(
      uint256(b) == a,
      'SafeCast: toUint224 overflow'
    );
    return b;
  }

  /**
   * @dev Downcast to a uint240, reverting on overflow.
   */
  function toUint240(
    uint256 a
  )
    internal
    pure
    returns (uint240)
  {
    uint240 b = uint240(a);
    require(
      uint256(b) == a,
      'SafeCast: toUint240 overflow'
    );
    return b;
  }
}
