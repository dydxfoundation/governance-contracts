// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IBridge } from '../governance/bridge/IBridge.sol';
import { Treasury } from './Treasury.sol';
import { TreasuryVester } from './TreasuryVester.sol';

/**
 * @title TreasuryBridge
 * @author dYdX
 *
 * @notice A treasury account that:
 *  - Rejects future vesting by setting the vesting recipient to another address.
 *  - May use the token bridge.
 */
contract TreasuryBridge is
  Treasury
{
  // Immutable addresses
  TreasuryVester public immutable TREASURY_VESTER;
  IBridge public immutable BRIDGE;
  address public immutable BURN_ADDRESS;

  /**
   * @notice Constructor.
   *
   * @param  treasuryVester  The address of the treasury vester.
   * @param  bridgeAddress   The address of bridge contract.
   * @param  burnAddress     The address of where to move the vesting to.
   */
  constructor(
    address treasuryVester,
    address bridgeAddress,
    address burnAddress
  ) {
    TREASURY_VESTER = TreasuryVester(treasuryVester);
    BRIDGE = IBridge(bridgeAddress);
    BURN_ADDRESS = burnAddress;
  }

  /**
   * @notice Rejects future vesting by setting the vesting recipient to a burn address.
   * Can be called by any address. First claims any outstanding vested tokens.
   *
   */
  function initialize()
    external
    virtual
    override
    initializer
  {
    TREASURY_VESTER.claim();
    TREASURY_VESTER.setRecipient(BURN_ADDRESS);
  }

  function getRevision()
    internal
    pure
    virtual
    override
    returns (uint256)
  {
    return 2;
  }

  /**
   * @notice Uses the bridge contract. Must have previously called `approve()` on the bridge contract.
   *
   * @param  amount       The amount of tokens to bridge
   * @param  accAddress   The address to send to.
   * @param  data         Arbitrary data to include in the event.
   */
  function bridgeTreasury(
    uint256 amount,
    bytes32 accAddress,
    bytes calldata data
  )
    external
    onlyOwner
  {
    BRIDGE.bridge(amount, accAddress, data);
  }
}
