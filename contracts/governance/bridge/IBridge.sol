// SPDX-License-Identifier: MIT
pragma solidity 0.7.5;

/**
 * @dev Interface of a bridge contract.
 */
interface IBridge {
  /**
   * @dev Emitted when a bridge event occurs.
   *
   * @param  id          Unique ID of the bridge event.
   * @param  amount      Amount of tokens bridged.
   * @param  from        The Ethereum address the tokens were transferred from.
   * @param  accAddress  The address to send to.
   * @param  data        Any arbitrary data.
   */
  event Bridge(
    uint256 indexed id,
    uint256 amount,
    address from,
    bytes accAddress,
    bytes data
  );

  /**
   * @notice Bridge a token.
   *
   * @param  amount       The amount of tokens to bridge
   * @param  accAddress   The address to send to.
   * @param  memo         Arbitrary memo to include in the event.
   */
  function bridge(
    uint256 amount,
    bytes calldata accAddress,
    bytes calldata memo
  ) external;
}

