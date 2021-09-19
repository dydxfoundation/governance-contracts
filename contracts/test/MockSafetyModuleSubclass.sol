// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IERC20 } from '../interfaces/IERC20.sol';
import { SafetyModuleV2 } from '../safety/v2/SafetyModuleV2.sol';

contract MockSafetyModuleSubclass is
  SafetyModuleV2
{
  constructor(
    IERC20 stakedToken,
    IERC20 rewardsToken,
    address rewardsTreasury,
    uint256 distributionStart,
    uint256 distributionEnd
  )
    SafetyModuleV2(
      stakedToken,
      rewardsToken,
      rewardsTreasury,
      distributionStart,
      distributionEnd
    )
  {}

  function mockTransferFromZero(
    address recipient,
    uint256 amount
  )
    external
  {
    _transfer(address(0), recipient, amount);
  }

  function mockApproveFromZero(
    address spender,
    uint256 amount
  )
    external
  {
    _approve(address(0), spender, amount);
  }
}
