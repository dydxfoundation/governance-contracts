import BigNumber from 'bignumber.js';

export enum eEthereumNetwork {
  coverage = 'coverage',
  hardhat = 'hardhat',
  kovan = 'kovan',
  ropsten = 'ropsten',
  main = 'main',
}

export enum eContractid {
  DistributionManager = 'DistributionManager',
  StakedToken = 'StakedToken',
  StakedTokenImpl = 'StakedTokenImpl',
  StakedDydxToken = 'StakedDydxToken',
  StakedDydxTokenImpl = 'StakedDydxTokenImpl',
  IncentivesController = 'IncentivesController',
  LiquidityStakingV1 = 'LiquidityStakingV1',
  StarkProxyV1 = 'StarkProxyV1',
  MockStarkPerpetual = 'MockStarkPerpetual',
  MockStakedToken = 'MockStakedToken',
  DydxRewardsVault = 'DydxRewardsVault',
  DydxRewardsVaultController = 'DydxRewardsVaultController',
  IERC20Detailed = 'IERC20Detailed',
  AdminUpgradeabilityProxy = 'AdminUpgradeabilityProxy',
  InitializableAdminUpgradeabilityProxy = 'InitializableAdminUpgradeabilityProxy',
  MintableErc20 = 'MintableErc20',
  LendingPoolMock = 'LendingPoolMock',
  MockTransferHook = 'MockTransferHook',
  ATokenMock = 'ATokenMock',
  DoubleTransferHelper = 'DoubleTransferHelper',
  ICRPFactory = 'ICRPFactory',
  IConfigurableRightsPool = 'IConfigurableRightsPool',
  IBPool = 'IBPool',
  IControllerEcosystemReserve = 'IControllerEcosystemReserve',
  MockSelfDestruct = 'SelfdestructTransfer',
}

export type tEthereumAddress = string;
export type tStringTokenBigUnits = string; // 1 ETH, or 10e6 USDC or 10e18 DAI
export type tBigNumberTokenBigUnits = BigNumber;
// 1 wei, or 1 basic unit of USDC, or 1 basic unit of DAI
export type tStringTokenSmallUnits = string;
export type tBigNumberTokenSmallUnits = BigNumber;

export interface iParamsPerNetwork<T> {
  [eEthereumNetwork.coverage]: T;
  [eEthereumNetwork.hardhat]: T;
  [eEthereumNetwork.kovan]: T;
  [eEthereumNetwork.ropsten]: T;
  [eEthereumNetwork.main]: T;
}
