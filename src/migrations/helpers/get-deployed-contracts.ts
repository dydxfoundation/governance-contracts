import {
  ClaimsProxy__factory,
  DydxGovernor__factory,
  DydxToken__factory,
  Executor__factory,
  GovernanceStrategy__factory,
  ProxyAdmin__factory,
  SafetyModuleV1__factory,
  SafetyModuleV2__factory,
  SM2Recovery__factory,
  Treasury__factory,
  TreasuryVester__factory,
  StarkProxyV2__factory,
} from '../../../types';
import { LiquidityStakingV1__factory } from '../../../types/factories/LiquidityStakingV1__factory';
import { MerkleDistributorV1__factory } from '../../../types/factories/MerkleDistributorV1__factory';
import config from '../../config';
import { getDeployerSigner } from '../../deploy-config/get-deployer-address';
import mainnetAddresses from '../../deployed-addresses/mainnet.json';
import { getNetworkName } from '../../hre';
import { DeployedContracts } from '../../types';
import { deployStarkProxyRecovery } from '../stark-proxy-recovery';

type DeployedAddresses = { [k in keyof DeployedContracts]: string };

export async function getDeployedContracts(): Promise<DeployedContracts> {
  const deployer = await getDeployerSigner();

  let deployedAddresses: DeployedAddresses;
  if (
    config.isMainnet() ||
    (config.isHardhat() && config.FORK_MAINNET)
  ) {

    // Deploy contracts for Stark Proxy recovery.
    const starkProxyRecoveryContracts = await deployStarkProxyRecovery({
      liquidityStakingAddress: mainnetAddresses.liquidityStaking,
      merkleDistributorAddress: mainnetAddresses.merkleDistributor,
    });

    deployedAddresses = {
      ...mainnetAddresses,
      starkProxyNewImpl: starkProxyRecoveryContracts.starkProxyNewImpl.address,
    };
  } else {
    throw new Error(`Deployed addresses not found for network ${getNetworkName()}`);
  }

  return {
    dydxToken: new DydxToken__factory(deployer).attach(deployedAddresses.dydxToken),
    governor: new DydxGovernor__factory(deployer).attach(deployedAddresses.governor),
    shortTimelock: new Executor__factory(deployer).attach(deployedAddresses.shortTimelock),
    longTimelock: new Executor__factory(deployer).attach(deployedAddresses.longTimelock),
    merklePauserTimelock: new Executor__factory(deployer).attach(deployedAddresses.merklePauserTimelock),
    rewardsTreasury: new Treasury__factory(deployer).attach(deployedAddresses.rewardsTreasury),
    rewardsTreasuryProxyAdmin: new ProxyAdmin__factory(deployer).attach(deployedAddresses.rewardsTreasuryProxyAdmin),
    safetyModule: new SafetyModuleV1__factory(deployer).attach(deployedAddresses.safetyModule),
    safetyModuleProxyAdmin: new ProxyAdmin__factory(deployer).attach(deployedAddresses.safetyModuleProxyAdmin),
    strategy: new GovernanceStrategy__factory(deployer).attach(deployedAddresses.strategy),
    communityTreasury: new Treasury__factory(deployer).attach(deployedAddresses.communityTreasury),
    communityTreasuryProxyAdmin: new ProxyAdmin__factory(deployer).attach(deployedAddresses.communityTreasuryProxyAdmin),
    rewardsTreasuryVester: new TreasuryVester__factory(deployer).attach(deployedAddresses.rewardsTreasuryVester),
    communityTreasuryVester: new TreasuryVester__factory(deployer).attach(deployedAddresses.communityTreasuryVester),
    claimsProxy: new ClaimsProxy__factory(deployer).attach(deployedAddresses.claimsProxy),
    safetyModuleNewImpl: new SafetyModuleV2__factory(deployer).attach(deployedAddresses.safetyModuleNewImpl),
    safetyModuleRecovery: new SM2Recovery__factory(deployer).attach(deployedAddresses.safetyModuleRecovery),
    safetyModuleRecoveryProxyAdmin: new ProxyAdmin__factory(deployer).attach(deployedAddresses.safetyModuleRecoveryProxyAdmin),
    liquidityStaking: new LiquidityStakingV1__factory(deployer).attach(deployedAddresses.liquidityStaking),
    liquidityStakingProxyAdmin: new ProxyAdmin__factory(deployer).attach(deployedAddresses.liquidityStakingProxyAdmin),
    merkleDistributor: new MerkleDistributorV1__factory(deployer).attach(deployedAddresses.merkleDistributor),
    merkleDistributorProxyAdmin: new ProxyAdmin__factory(deployer).attach(deployedAddresses.merkleDistributorProxyAdmin),
    starkProxyNewImpl: new StarkProxyV2__factory(deployer).attach(deployedAddresses.starkProxyNewImpl),
  };
}
