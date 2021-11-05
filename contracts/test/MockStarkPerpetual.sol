// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { IERC20 } from '../interfaces/IERC20.sol';

/**
 * @title MockStarkPerpetual
 * @author dYdX
 *
 * @notice Mock implementation for the StarkPerpetual contract, for accessing the dYdX L2 exchange.
 * @dev See https://github.com/starkware-libs/starkex-contracts
 */
contract MockStarkPerpetual {

  // ============ Mock Exchange Functionality ============

  event MockStarkRegistered(
    address ethKey,
    uint256 starkKey,
    bytes signature
  );

  event MockStarkDeposited(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    uint256 quantizedAmount
  );

  event MockStarkWithdrew(
    uint256 starkKey,
    uint256 assetType,
    uint256 amount
  );

  event MockStarkDepositCanceled(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId
  );

  event MockStarkDepositReclaimed(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId
  );

  mapping(uint256 => address) public _REGISTRATIONS_;

  mapping(address => uint256) public _DEPOSITS_;

  IERC20 public immutable TOKEN;

  constructor(
    IERC20 token
  ) {
    TOKEN = token;
  }

  function registerUser(
    address ethKey,
    uint256 starkKey,
    bytes calldata signature
  )
    external
  {
    _REGISTRATIONS_[starkKey] = ethKey;
    emit MockStarkRegistered(ethKey, starkKey, signature);
  }

  function deposit(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    uint256 quantizedAmount
  )
    external
  {
    // Require registered.
    getEthKey(starkKey);

    // Assume no overflow since this is just for test purposes.
    _DEPOSITS_[msg.sender] = _DEPOSITS_[msg.sender] + quantizedAmount;
    require(TOKEN.transferFrom(msg.sender, address(this), quantizedAmount));
    emit MockStarkDeposited(starkKey, assetType, vaultId, quantizedAmount);
  }

  function withdraw(
    uint256 starkKey,
    uint256 assetType
  )
    external
  {
    // Require registered.
    getEthKey(starkKey);

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
  )
    external
  {
    // Require registered.
    getEthKey(starkKey);
  }

  function getEthKey(
    uint256 starkKey
  )
    public
    view
    returns(address)
  {
    address ethKey = _REGISTRATIONS_[starkKey];
    require(
      ethKey != address(0),
      'USER_UNREGISTERED'
    );
    return ethKey;
  }

  function depositCancel(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId
  ) external {
    // Require registered.
    getEthKey(starkKey);

    emit MockStarkDepositCanceled(starkKey, assetType, vaultId);
  }

  function depositReclaim(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId
  ) external {
    // Require registered.
    getEthKey(starkKey);

    emit MockStarkDepositReclaimed(starkKey, assetType, vaultId);
  }

  // ============ Mock Governance Functionality ============

  mapping(address => bool) public _MAIN_GOVERNORS_;
  mapping(address => bool) public _PROXY_GOVERNORS_;
  mapping(uint256 => mapping(bytes32 => bool)) public _REGISTERED_ASSET_CONFIGS_;
  mapping(bytes32 => bool) public _REGISTERED_GLOBAL_CONFIGS_;
  mapping(uint256 => bytes32) public _ASSET_CONFIGS_;
  bytes32 public _GLOBAL_CONFIG_;

  function mainAcceptGovernance()
    external
  {
    // Assume already nominated.
    _MAIN_GOVERNORS_[msg.sender] = true;
  }

  function proxyAcceptGovernance()
    external
  {
    // Assume already nominated.
    _PROXY_GOVERNORS_[msg.sender] = true;
  }

  function mainRemoveGovernor(
    address governorForRemoval
  )
    external
  {
    require(
      _MAIN_GOVERNORS_[msg.sender],
      'MockStarkPerpetual: Sender is not a main governor'
    );
    require(
      governorForRemoval != msg.sender,
      'MockStarkPerpetual: Cannot remove self'
    );
    _MAIN_GOVERNORS_[governorForRemoval] = false;
  }

  function proxyRemoveGovernor(
    address governorForRemoval
  )
    external
  {
    require(
      _PROXY_GOVERNORS_[msg.sender],
      'MockStarkPerpetual: Sender is not a proxy governor'
    );
    require(
      governorForRemoval != msg.sender,
      'MockStarkPerpetual: Cannot remove self'
    );
    _PROXY_GOVERNORS_[governorForRemoval] = false;
  }

  function registerAssetConfigurationChange(
    uint256 assetId,
    bytes32 configHash
  )
    external
  {
    require(
      _MAIN_GOVERNORS_[msg.sender],
      'MockStarkPerpetual: Sender is not a main governor'
    );
    _REGISTERED_ASSET_CONFIGS_[assetId][configHash] = true;
  }

  function applyAssetConfigurationChange(
    uint256 assetId,
    bytes32 configHash
  )
    external
  {
    require(
      _MAIN_GOVERNORS_[msg.sender],
      'MockStarkPerpetual: Sender is not a main governor'
    );
    require(
      _REGISTERED_ASSET_CONFIGS_[assetId][configHash],
      'MockStarkPerpetual: Asset config not registered'
    );
    _ASSET_CONFIGS_[assetId] = configHash;
  }

  function registerGlobalConfigurationChange(
    bytes32 configHash
  )
    external
  {
    require(
      _MAIN_GOVERNORS_[msg.sender],
      'MockStarkPerpetual: Sender is not a main governor'
    );
    _REGISTERED_GLOBAL_CONFIGS_[configHash] = true;
  }

  function applyGlobalConfigurationChange(
    bytes32 configHash
  )
    external
  {
    require(
      _MAIN_GOVERNORS_[msg.sender],
      'MockStarkPerpetual: Sender is not a main governor'
    );
    require(
      _REGISTERED_GLOBAL_CONFIGS_[configHash],
      'MockStarkPerpetual: Global config not registered'
    );
    _GLOBAL_CONFIG_ = configHash;
  }
}
