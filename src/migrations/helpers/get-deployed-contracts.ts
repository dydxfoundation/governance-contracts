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
} from '../../../types';
import config from '../../config';
import mainnetAddresses from '../../deployed-addresses/mainnet.json';
import { getHre, getNetworkName } from '../../hre';
import { DeployedContracts } from '../../types';

type DeployedAddresses = { [k in keyof DeployedContracts]: string };

export function getDeployedContracts(): DeployedContracts {
  let deployedAddresses: DeployedAddresses;
  if (
    config.isMainnet() ||
    (config.isHardhat() && config.FORK_MAINNET)
  ) {
    deployedAddresses = mainnetAddresses;
  } else {
    throw new Error(`Deployed addresses not found for network ${getNetworkName()}`);
  }

  const signer = getHre().ethers.provider.getSigner();

  return {
    dydxToken: new DydxToken__factory(signer).attach(deployedAddresses.dydxToken),
    governor: new DydxGovernor__factory(signer).attach(deployedAddresses.governor),
    shortTimelock: new Executor__factory(signer).attach(deployedAddresses.shortTimelock),
    longTimelock: new Executor__factory(signer).attach(deployedAddresses.longTimelock),
    merklePauserTimelock: new Executor__factory(signer).attach(deployedAddresses.merklePauserTimelock),
    rewardsTreasury: new Treasury__factory(signer).attach(deployedAddresses.rewardsTreasury),
    rewardsTreasuryProxyAdmin: new ProxyAdmin__factory(signer).attach(deployedAddresses.rewardsTreasuryProxyAdmin),
    safetyModule: new SafetyModuleV1__factory(signer).attach(deployedAddresses.safetyModule),
    safetyModuleProxyAdmin: new ProxyAdmin__factory(signer).attach(deployedAddresses.safetyModuleProxyAdmin),
    strategy: new GovernanceStrategy__factory(signer).attach(deployedAddresses.strategy),
    communityTreasury: new Treasury__factory(signer).attach(deployedAddresses.communityTreasury),
    communityTreasuryProxyAdmin: new ProxyAdmin__factory(signer).attach(deployedAddresses.communityTreasuryProxyAdmin),
    rewardsTreasuryVester: new TreasuryVester__factory(signer).attach(deployedAddresses.rewardsTreasuryVester),
    communityTreasuryVester: new TreasuryVester__factory(signer).attach(deployedAddresses.communityTreasuryVester),
    claimsProxy: new ClaimsProxy__factory(signer).attach(deployedAddresses.claimsProxy),
    safetyModuleNewImpl: new SafetyModuleV2__factory(signer).attach(deployedAddresses.safetyModuleNewImpl),
    safetyModuleRecovery: new SM2Recovery__factory(signer).attach(deployedAddresses.safetyModuleRecovery),
  };
}
