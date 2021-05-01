import BigNumber from 'bignumber.js';
import { Signer } from 'ethers';
import {
  PSM_STAKER_PREMIUM,
  COOLDOWN_SECONDS,
  UNSTAKE_WINDOW,
  STAKED_DYDX_NAME,
  STAKED_DYDX_SYMBOL,
  STAKED_DYDX_DECIMALS,
  MAX_UINT_AMOUNT,
  BLACKOUT_WINDOW,
  EPOCH_LENGTH,
  getStarkProxyBorrowerJsonDBKey,
} from '../../helpers/constants';
import {
  deployInitializableAdminUpgradeabilityProxy,
  deployIncentivesController,
  deployStakedDydxToken,
  deployLiquidityStakingV1,
  deployDydxRewardsVault,
  deployDydxRewardsVaultController,
  deployMockStakedToken,
  deployStarkProxyV1,
} from '../../helpers/contracts-accessors';
import { insertContractAddressInDb } from '../../helpers/contracts-helpers';
import { waitForTx, timeLatest } from '../../helpers/misc-utils';
import { eContractid, tEthereumAddress } from '../../helpers/types';
import { MintableErc20 } from '../../types/MintableErc20';
import { MockStakedToken } from '../../types/MockStakedToken';
import { Erc20 } from '../../types/Erc20';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';

export const testDeployStakedDydxToken = async (
  dydxToken: MintableErc20,
  deployer: Signer,
  rewardsVault: Signer,
  restWallets: Signer[]
) => {
  const proxyAdmin = await restWallets[0].getAddress();
  const emissionManager = await deployer.getAddress();

  const stakedToken = dydxToken.address;
  const rewardsToken = dydxToken.address;

  const rewardsVaultAddress = await rewardsVault.getAddress();

  // Deployed staked DYDX token upgradeable contract.
  const stakedDydxTokenProxy = await deployInitializableAdminUpgradeabilityProxy();
  const stakedDydxTokenImpl = await deployStakedDydxToken([
    stakedToken,
    rewardsToken,
    COOLDOWN_SECONDS,
    UNSTAKE_WINDOW,
    rewardsVaultAddress,
    emissionManager,
    (1000 * 60 * 60).toString(),
  ]);
  const stakedDydxTokenEncodedInitialize = stakedDydxTokenImpl.interface.encodeFunctionData(
    'initialize',
    [STAKED_DYDX_NAME, STAKED_DYDX_SYMBOL, STAKED_DYDX_DECIMALS]
  );
  await stakedDydxTokenProxy['initialize(address,address,bytes)'](
    stakedDydxTokenImpl.address,
    proxyAdmin,
    stakedDydxTokenEncodedInitialize
  );
  await insertContractAddressInDb(eContractid.StakedDydxToken, stakedDydxTokenProxy.address);

  // Deployed incentives controller upgradeable contract.
  const incentivesControllerProxy = await deployInitializableAdminUpgradeabilityProxy();
  const incentivesControllerImplementation = await deployIncentivesController([
    dydxToken.address,
    rewardsVaultAddress,
    stakedDydxTokenProxy.address,
    PSM_STAKER_PREMIUM,
    emissionManager,
    (1000 * 60 * 60).toString(),
  ]);
  const incentivesControllerEncodedInitialize = incentivesControllerImplementation.interface.encodeFunctionData(
    'initialize'
  );
  await incentivesControllerProxy['initialize(address,address,bytes)'](
    incentivesControllerImplementation.address,
    proxyAdmin,
    incentivesControllerEncodedInitialize
  );
  await insertContractAddressInDb(
    eContractid.IncentivesController,
    incentivesControllerProxy.address
  );

  // Approve incentives contracts to pull max amount of DYDX token from rewards vault.
  await waitForTx(
    await dydxToken.connect(rewardsVault).approve(stakedDydxTokenProxy.address, MAX_UINT_AMOUNT)
  );
  await waitForTx(
    await dydxToken
      .connect(rewardsVault)
      .approve(incentivesControllerProxy.address, MAX_UINT_AMOUNT)
  );

  return {
    incentivesControllerProxy,
    stakedDydxTokenProxy,
  };
};

export const testDeployLiquidityStakingV1 = async (
  dydxToken: tEthereumAddress,
  dydxRewardsVault: tEthereumAddress,
  restWallets: Signer[]
) => {
  // deploy mock staked token
  // TODO: Use actual USDC contract
  const mockStakedToken: MockStakedToken = await deployMockStakedToken();
  const mockStakedTokenAddress: tEthereumAddress = mockStakedToken.address;

  const proxyAdmin = await restWallets[0].getAddress();

  const distributionStart: BigNumber = (await timeLatest()).plus(60 * 60 * 24 * 60); // 60 days after deployment
  const distributionEnd: BigNumber = distributionStart.plus(60 * 60 * 24 * 365); // 1 year after `distributionStart`

  // Deployed LiquidityStakingV1 upgradeable contract
  const liquidityStakingV1Proxy = await deployInitializableAdminUpgradeabilityProxy();
  const liquidityStakingV1Implementation = await deployLiquidityStakingV1(
    mockStakedTokenAddress,
    dydxToken,
    dydxRewardsVault,
    distributionStart,
    distributionEnd
  );

  // By default, start epoch zero at the same time as the rewards distribution.
  const offset = distributionStart;

  const liquidityStakingV1EncodedInitialize = liquidityStakingV1Implementation.interface.encodeFunctionData(
    'initialize',
    [EPOCH_LENGTH.toString(), offset.toString(), BLACKOUT_WINDOW.toString()]
  );
  await liquidityStakingV1Proxy['initialize(address,address,bytes)'](
    liquidityStakingV1Implementation.address,
    proxyAdmin,
    liquidityStakingV1EncodedInitialize
  );
  await insertContractAddressInDb(eContractid.LiquidityStakingV1, liquidityStakingV1Proxy.address);

  return {
    liquidityStakingV1Proxy,
    mockStakedToken,
  };
};

export const testDeployStarkProxyV1 = async (
  liquidityStakingV1: LiquidityStakingV1,
  starkPerpetual: MockStarkPerpetual,
  mockStakedToken: Erc20,
  guardian: tEthereumAddress,
  borrowerNum: number,
  restWallets: Signer[]
) => {
  const proxyAdmin = await restWallets[0].getAddress();

  // Deployed StarkProxy upgradeable contract
  const starkProxy = await deployInitializableAdminUpgradeabilityProxy();
  const starkProxyImplementation = await deployStarkProxyV1(
    liquidityStakingV1.address,
    starkPerpetual.address,
    mockStakedToken.address
  );

  const starkProxyV1EncodedInitialize = starkProxyImplementation.interface.encodeFunctionData(
    'initialize',
    [guardian]
  );
  await starkProxy['initialize(address,address,bytes)'](
    starkProxyImplementation.address,
    proxyAdmin,
    starkProxyV1EncodedInitialize
  );

  const starkProxyBorrowerId: string = getStarkProxyBorrowerJsonDBKey(borrowerNum);
  await insertContractAddressInDb(starkProxyBorrowerId, starkProxy.address);

  return starkProxy;
};

export const testDeployDydxRewardsVault = async (
  dydxRewardsVaultController: tEthereumAddress,
  restWallets: Signer[]
) => {
  const proxyAdmin = await restWallets[0].getAddress();

  // Deployed DydxRewardsVault upgradeable contract
  const dydxRewardsVaultProxy = await deployInitializableAdminUpgradeabilityProxy();
  const dydxRewardsVaultImplementation = await deployDydxRewardsVault();
  const dydxRewardsVaultEncodedInitialize = dydxRewardsVaultImplementation.interface.encodeFunctionData(
    'initialize',
    // TODO: Allow these parameters to be configurable for testing
    [dydxRewardsVaultController]
  );
  await dydxRewardsVaultProxy['initialize(address,address,bytes)'](
    dydxRewardsVaultImplementation.address,
    proxyAdmin,
    dydxRewardsVaultEncodedInitialize
  );
  await insertContractAddressInDb(eContractid.DydxRewardsVault, dydxRewardsVaultProxy.address);

  return dydxRewardsVaultProxy;
};

export const testDeployDydxRewardsVaultController = async (
  dydxGovShortTimelock: tEthereumAddress,
  dydxRewardsVault: tEthereumAddress
) => {
  // Deployed DydxRewardsVaultController
  const dydxRewardsVaultController = await deployDydxRewardsVaultController(
    dydxGovShortTimelock,
    dydxRewardsVault
  );
  await insertContractAddressInDb(
    eContractid.DydxRewardsVaultController,
    dydxRewardsVaultController.address
  );

  return dydxRewardsVaultController;
};
