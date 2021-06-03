pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../interfaces/IERC20.sol';

/**
 * @title MockStarkPerpetual
 * @author dYdX
 *
 * @notice Mock implementation for the StarkPerpetual contract, for accessing the dYdX L2 exchange.
 * @dev See https://github.com/starkware-libs/starkex-contracts
 */
contract MockStarkPerpetual {
  event MockStarkDeposited(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    uint256 quantizedAmount
  );

  event MockStarkWithdrew(uint256 starkKey, uint256 assetType, uint256 amount);

  mapping(address => uint256) public _DEPOSITS_;

  IERC20 public immutable TOKEN;

  constructor(IERC20 token) {
    TOKEN = token;
  }

  function deposit(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    uint256 quantizedAmount
  ) external {
    // Assume no overflow since this is just for test purposes.
    _DEPOSITS_[msg.sender] = _DEPOSITS_[msg.sender] + quantizedAmount;
    require(TOKEN.transferFrom(msg.sender, address(this), quantizedAmount));
    emit MockStarkDeposited(starkKey, assetType, vaultId, quantizedAmount);
  }

  function withdraw(uint256 starkKey, uint256 assetType) external {
    uint256 amount = _DEPOSITS_[msg.sender];
    _DEPOSITS_[msg.sender] = 0;
    require(TOKEN.transfer(msg.sender, amount));
    emit MockStarkWithdrew(starkKey, assetType, amount);
  }

  function forcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost
  ) external {}
}
