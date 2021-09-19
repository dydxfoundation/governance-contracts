import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor__factory,
  SafetyModuleV2__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

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
