import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor__factory,
  SafetyModuleV2,
  SafetyModuleV2__factory,
  SM2Recovery,
  SM2Recovery__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';
import { deployUpgradeable } from './helpers/deploy-upgradeable';

export async function deploySafetyModuleRecovery({
  startStep = 0,

  dydxTokenAddress,
  rewardsTreasuryAddress,

  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
}: {
  startStep?: number,

  dydxTokenAddress: string,
  rewardsTreasuryAddress: string,

  safetyModuleNewImplAddress?: string,
  safetyModuleRecoveryAddress?: string,
}) {
  log('Beginning safety module recovery deployment\n');
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  let safetyModuleNewImpl: SafetyModuleV2;
  let safetyModuleRecovery: SM2Recovery;

  if (startStep <= 1) {
    log('Step 1. Deploy new safety module implementation contract.');
    safetyModuleNewImpl = await new SafetyModuleV2__factory(deployer).deploy(
      dydxTokenAddress,
      dydxTokenAddress,
      rewardsTreasuryAddress,
      deployConfig.SM_RECOVERY_DISTRIBUTION_START,
      deployConfig.SM_RECOVERY_DISTRIBUTION_END,
    );
    await waitForTx(safetyModuleNewImpl.deployTransaction);
    safetyModuleNewImplAddress = safetyModuleNewImpl.address;
  } else {
    if (!safetyModuleNewImplAddress) {
      throw new Error('Expected parameter safetyModuleNewImplAddress to be specified.');
    }
    safetyModuleNewImpl = new SafetyModuleV2__factory(deployer).attach(safetyModuleNewImplAddress);
  }

  if (startStep <= 2) {
    log('Step 2. Deploy the upgradeable Safety Module recovery contract.');
    [safetyModuleRecovery] = await deployUpgradeable(
      SM2Recovery__factory,
      deployer,
      [dydxTokenAddress],
      [],
    );
    safetyModuleRecoveryAddress = safetyModuleRecovery.address;
  } else {
    if (!safetyModuleRecoveryAddress) {
      throw new Error('Expected parameter safetyModuleRecoveryAddress to be specified.');
    }
    safetyModuleRecovery = new SM2Recovery__factory(deployer).attach(safetyModuleRecoveryAddress);
  }

  log('\n=== SAFETY MODULE RECOVERY DEPLOYMENT COMPLETE ===\n');

  return {
    safetyModuleNewImpl,
    safetyModuleRecovery,
  };
}

export async function createSafetyModuleRecoveryProposal({
  proposalIpfsHashHex,
  governorAddress,
  longTimelockAddress,
  safetyModuleAddress,
  safetyModuleProxyAdminAddress,
  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  longTimelockAddress: string,
  safetyModuleAddress: string,
  safetyModuleProxyAdminAddress: string,
  safetyModuleNewImplAddress: string,
  safetyModuleRecoveryAddress: string,
}) {
  const hre = getHre();
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Creating safety module recovery proposal with proposer ${deployerAddress}\n`);

  const initializeCalldata = new Interface(SafetyModuleV2__factory.abi).encodeFunctionData(
    'initialize',
    [
      safetyModuleRecoveryAddress,
      deployConfig.SM_RECOVERY_COMPENSATION_AMOUNT,
    ],
  );

  const governor = await new DydxGovernor__factory(deployer).attach(governorAddress);
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    longTimelockAddress,
    [safetyModuleProxyAdminAddress],
    ['0'],
    ['upgradeAndCall(address,address,bytes)'],
    [hre.ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      [safetyModuleAddress, safetyModuleNewImplAddress, initializeCalldata],
    )],
    [false],
    proposalIpfsHashHex,
  ];

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}
