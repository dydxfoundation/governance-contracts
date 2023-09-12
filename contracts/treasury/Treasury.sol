// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { OwnableUpgradeable } from '../dependencies/open-zeppelin/OwnableUpgradeable.sol';
import { SafeERC20 } from '../dependencies/open-zeppelin/SafeERC20.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { VersionedInitializable } from '../utils/VersionedInitializable.sol';

/**
 * @title Treasury
 * @author dYdX
 *
 * @notice Holds an ERC-20 token. Allows the owner to transfer the token or set allowances.
 */
contract Treasury is
  OwnableUpgradeable,
  VersionedInitializable
{
  using SafeERC20 for IERC20;

  uint256 public constant REVISION = 1;

  function initialize()
    external
    virtual
    initializer
  {
    __Ownable_init();
  }

  function approve(
    IERC20 token,
    address recipient,
    uint256 amount
  )
    external
    onlyOwner
  {
    // SafeERC20 safeApprove() requires setting the allowance to zero first.
    token.safeApprove(recipient, 0);
    token.safeApprove(recipient, amount);
  }

  function transfer(
    IERC20 token,
    address recipient,
    uint256 amount
  )
    external
    onlyOwner
  {
    token.safeTransfer(recipient, amount);
  }

  function getRevision()
    internal
    pure
    virtual
    override
    returns (uint256)
  {
    return REVISION;
  }
}
