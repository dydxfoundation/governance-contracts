// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

/**
 * @title IStarkPerpetual
 * @author dYdX
 *
 * @notice Partial interface for the StarkPerpetual contract, for accessing the dYdX L2 exchange.
 * @dev See https://github.com/starkware-libs/starkex-contracts
 */
interface IStarkPerpetual {
  function registerUser(
    address ethKey,
    uint256 starkKey,
    bytes calldata signature
  ) external;

  function deposit(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    uint256 quantizedAmount
  ) external;

  function withdraw(uint256 starkKey, uint256 assetType) external;

  function forcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost
  ) external;

  function forcedTradeRequest(
    uint256 starkKeyA,
    uint256 starkKeyB,
    uint256 vaultIdA,
    uint256 vaultIdB,
    uint256 collateralAssetId,
    uint256 syntheticAssetId,
    uint256 amountCollateral,
    uint256 amountSynthetic,
    bool aIsBuyingSynthetic,
    uint256 submissionExpirationTime,
    uint256 nonce,
    bytes calldata signature,
    bool premiumCost
  ) external;
}
