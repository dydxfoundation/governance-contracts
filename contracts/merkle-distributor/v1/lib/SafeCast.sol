pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

/**
 * @dev Methods for downcasting unsigned integers, reverting on overflow.
 */
library SafeCast {
  /**
   * @dev Downcase to a uint128, reverting on overflow.
   */
  function toUint128(uint256 a) internal pure returns (uint128) {
    uint128 b = uint128(a);
    require(uint256(b) == a, 'SafeCast: toUint128 overflow');
    return b;
  }
}
