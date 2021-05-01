// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import '../interfaces/IERC20.sol';

contract DoubleTransferHelper {
  IERC20 public immutable TOKEN;

  constructor(IERC20 token) public {
    TOKEN = token;
  }

  function doubleSend(
    address to,
    uint256 amount1,
    uint256 amount2
  ) external {
    TOKEN.transfer(to, amount1);
    TOKEN.transfer(to, amount2);
  }
}
