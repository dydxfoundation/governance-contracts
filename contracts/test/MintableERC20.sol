// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { ERC20 } from '../dependencies/open-zeppelin/ERC20.sol';

/**
 * @title MintableERC20
 * @author dYdX
 *
 * @notice Test ERC20 token that allows anyone to mint.
 */
contract MintableERC20 is
  ERC20
{
  constructor(
    string memory name,
    string memory symbol,
    uint8 decimals
  )
    ERC20(name, symbol)
  {
    _setupDecimals(decimals);
  }

  /**
   * @notice Mint tokens to the specified account.
   *
   * @param  account  The account to receive minted tokens.
   * @param  value    The amount of tokens to mint.
   */
  function mint(
    address account,
    uint256 value
  )
    external
  {
    _mint(account, value);
  }
}
