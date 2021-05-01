import BigNumber from 'bignumber.js';
import { deployContract, getContractFactory, getContract } from './contracts-helpers';
import { eContractid, tEthereumAddress } from './types';
import { MintableErc20 } from '../types/MintableErc20';
import { StakedDydxToken } from '../types/StakedDydxToken';
import { IcrpFactory } from '../types/IcrpFactory'; // Configurable right pool factory
import { IConfigurableRightsPool } from '../types/IConfigurableRightsPool';
import { IControllerEcosystemReserve } from '../types/IControllerEcosystemReserve';
import { SelfdestructTransfer } from '../types/SelfdestructTransfer';
import { IbPool } from '../types/IbPool'; // Balancer pool
import { StakedToken } from '../types/StakedToken';
import { Ierc20Detailed } from '../types/Ierc20Detailed';
import { InitializableAdminUpgradeabilityProxy } from '../types/InitializableAdminUpgradeabilityProxy';
import { IncentivesController } from '../types/IncentivesController';
import { LiquidityStakingV1 } from '../types/LiquidityStakingV1';
import { StarkProxyV1 } from '../types/StarkProxyV1';
import { MockStarkPerpetual } from '../types/MockStarkPerpetual';
import { MockStakedToken } from '../types/MockStakedToken';
import { DydxRewardsVault } from '../types/DydxRewardsVault';
import { DydxRewardsVaultController } from '../types/DydxRewardsVaultController';
import { MockTransferHook } from '../types/MockTransferHook';
import { verifyContract } from './etherscan-verification';
import { ATokenMock } from '../types/ATokenMock';
import { getDb, DRE } from './misc-utils';
import { DoubleTransferHelper } from '../types/DoubleTransferHelper';
import {
  ZERO_ADDRESS,
  NUM_STARK_PROXY_BORROWERS,
  getStarkProxyBorrowerJsonDBKey,
} from './constants';
import { Signer } from 'ethers';

export const deployStakedDydxToken = async (
  [
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    tEthereumAddress,
    tEthereumAddress,
    string
  ],
  verify?: boolean
) => {
  const id = eContractid.StakedDydxToken;
  const args: string[] = [
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
    ZERO_ADDRESS, // gov address
  ];
  const instance = await deployContract<StakedDydxToken>(id, args);
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployStakedToken = async (
  [
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
    name,
    symbol,
    decimals,
    governance,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string,
    string,
    tEthereumAddress
  ],
  verify?: boolean,
  signer?: Signer
) => {
  const id = eContractid.StakedToken;
  const args: string[] = [
    stakedToken,
    rewardsToken,
    cooldownSeconds,
    unstakeWindow,
    rewardsVault,
    emissionManager,
    distributionDuration,
    name,
    symbol,
    decimals,
    governance,
  ];
  const instance = await deployContract<StakedToken>(id, args, '', signer);
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployIncentivesController = async (
  [rewardToken, rewardsVault, dydxPsm, extraPsmReward, emissionManager, distributionDuration]: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    tEthereumAddress,
    string
  ],
  verify?: boolean
) => {
  const id = eContractid.IncentivesController;
  const args: string[] = [
    rewardToken,
    rewardsVault,
    dydxPsm,
    extraPsmReward,
    emissionManager,
    distributionDuration,
  ];
  const instance = await deployContract<IncentivesController>(id, args);
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployLiquidityStakingV1 = async (
  stakedToken: tEthereumAddress,
  dydxToken: tEthereumAddress,
  rewardsVault: tEthereumAddress,
  distributionStart: BigNumber,
  distributionEnd: BigNumber,
  verify?: boolean
): Promise<LiquidityStakingV1> => {
  const id = eContractid.LiquidityStakingV1;
  const args: string[] = [
    stakedToken,
    dydxToken,
    rewardsVault,
    distributionStart.toString(),
    distributionEnd.toString(),
  ];
  const instance: LiquidityStakingV1 = await deployContract<LiquidityStakingV1>(id, args);
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployStarkProxyV1 = async (
  liquidityStakingV1: tEthereumAddress,
  starkPerpetual: tEthereumAddress,
  mockStakedToken: tEthereumAddress,
  verify?: boolean
): Promise<StarkProxyV1> => {
  const args: string[] = [liquidityStakingV1, starkPerpetual, mockStakedToken];
  const id = eContractid.StarkProxyV1;
  const instance: StarkProxyV1 = await deployContract<StarkProxyV1>(id, args);
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployMockStarkPerpetual = async (
  mockStakedToken: tEthereumAddress,
  verify?: boolean
): Promise<MockStarkPerpetual> => {
  const args: string[] = [mockStakedToken];
  const instance: MockStarkPerpetual = await deployContract<MockStarkPerpetual>(
    eContractid.MockStarkPerpetual,
    args
  );
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployMockStakedToken = async (verify?: boolean): Promise<MockStakedToken> => {
  const id = eContractid.MockStakedToken;
  const args: string[] = ['Mock Staked Token', 'MOCK'];
  const instance: MockStakedToken = await deployContract<MockStakedToken>(id, args);
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployDydxRewardsVault = async (verify?: boolean): Promise<DydxRewardsVault> => {
  const id = eContractid.DydxRewardsVault;
  const args: string[] = [];
  const instance: DydxRewardsVault = await deployContract<DydxRewardsVault>(id, args);
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployDydxRewardsVaultController = async (
  dydxGovShortTimelock: tEthereumAddress,
  dydxRewardsVault: tEthereumAddress,
  verify?: boolean
): Promise<DydxRewardsVaultController> => {
  const id = eContractid.DydxRewardsVaultController;
  const args: string[] = [dydxGovShortTimelock, dydxRewardsVault];
  const instance: DydxRewardsVaultController = await deployContract<DydxRewardsVaultController>(
    id,
    args
  );
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployMintableErc20 = async ([name, symbol, decimals]: [string, string, number]) =>
  await deployContract<MintableErc20>(eContractid.MintableErc20, [name, symbol, decimals]);

export const deployInitializableAdminUpgradeabilityProxy = async (
  verify?: boolean,
  signer?: Signer
) => {
  const id = eContractid.InitializableAdminUpgradeabilityProxy;
  const args: string[] = [];
  const instance = await deployContract<InitializableAdminUpgradeabilityProxy>(
    id,
    args,
    '',
    signer
  );
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const deployMockTransferHook = async () =>
  await deployContract<MockTransferHook>(eContractid.MockTransferHook, []);

export const deployATokenMock = async (icAddress: tEthereumAddress, slug: string) =>
  await deployContract<ATokenMock>(eContractid.ATokenMock, [icAddress], slug);

export const deployDoubleTransferHelper = async (dydxToken: tEthereumAddress, verify?: boolean) => {
  const id = eContractid.DoubleTransferHelper;
  const args = [dydxToken];
  const instance = await deployContract<DoubleTransferHelper>(id, args);
  await instance.deployTransaction.wait();
  if (verify) {
    await verifyContract(instance.address, args);
  }
  return instance;
};

export const getMintableErc20 = getContractFactory<MintableErc20>(eContractid.MintableErc20);

export const getStakedDydxToken = getContractFactory<StakedDydxToken>(eContractid.StakedDydxToken);

export const getStakedDydxTokenProxy = async (address?: tEthereumAddress) => {
  return await getContract<InitializableAdminUpgradeabilityProxy>(
    eContractid.InitializableAdminUpgradeabilityProxy,
    address ||
      (await getDb().get(`${eContractid.StakedDydxToken}.${DRE.network.name}`).value()).address
  );
};

export const getStakedDydxTokenImpl = async (address?: tEthereumAddress) => {
  return await getContract<StakedDydxToken>(
    eContractid.StakedDydxToken,
    address ||
      (await getDb().get(`${eContractid.StakedDydxTokenImpl}.${DRE.network.name}`).value()).address
  );
};

export const getStakedToken = async (address?: tEthereumAddress) => {
  return await getContract<StakedToken>(
    eContractid.StakedToken,
    address || (await getDb().get(`${eContractid.StakedToken}.${DRE.network.name}`).value()).address
  );
};

export const getDydxIncentivesController = getContractFactory<IncentivesController>(
  eContractid.IncentivesController
);

export const getLiquidityStakingV1 = getContractFactory<LiquidityStakingV1>(
  eContractid.LiquidityStakingV1
);

export const getBorrowerStarkProxy = (borrowerNum: number) =>
  getContractFactory<StarkProxyV1>(
    // multiple versions of StarkProxyV1 can be deployed, first argument is key in JSON DB and second argument is artifact name
    getStarkProxyBorrowerJsonDBKey(borrowerNum),
    eContractid.StarkProxyV1
  )();

export const getMockStakedToken = getContractFactory<MockStakedToken>(eContractid.MockStakedToken);

export const getIErc20Detailed = getContractFactory<Ierc20Detailed>(eContractid.IERC20Detailed);

export const getATokenMock = getContractFactory<ATokenMock>(eContractid.ATokenMock);

export const getCRPFactoryContract = (address: tEthereumAddress) =>
  getContract<IcrpFactory>(eContractid.ICRPFactory, address);

export const getCRPContract = (address: tEthereumAddress) =>
  getContract<IConfigurableRightsPool>(eContractid.IConfigurableRightsPool, address);

export const getBpool = (address: tEthereumAddress) =>
  getContract<IbPool>(eContractid.IBPool, address);

export const getERC20Contract = (address: tEthereumAddress) =>
  getContract<MintableErc20>(eContractid.MintableErc20, address);

export const getController = (address: tEthereumAddress) =>
  getContract<IControllerEcosystemReserve>(eContractid.IControllerEcosystemReserve, address);

export const deploySelfDestruct = async () => {
  const id = eContractid.MockSelfDestruct;
  const instance = await deployContract<SelfdestructTransfer>(id, []);
  await instance.deployTransaction.wait();
  return instance;
};
