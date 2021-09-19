import { Interface } from 'ethers/lib/utils';

import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { log } from '../../src/lib/logging';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { createSafetyModuleRecoveryProposal } from '../../src/migrations/safety-module-recovery-proposal';
import {
  DydxGovernor__factory,
  DydxToken__factory,
  ProxyAdmin__factory,
  SafetyModuleV2__factory,
} from '../../types';
import { advanceBlock, increaseTimeAndMine } from '../helpers/evm';

const MOCK_PROPOSAL_IPFS_HASH = (
  '0x0000000000000000000000000000000000000000000000000000000000000000'
);

export async function executeSafetyModuleUpgradeViaProposal({
  dydxTokenAddress,
  governorAddress,
  longTimelockAddress,
  safetyModuleAddress,
  safetyModuleProxyAdminAddress,
  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
}: {
  dydxTokenAddress: string,
  governorAddress: string,
  longTimelockAddress: string,
  safetyModuleAddress: string,
  safetyModuleProxyAdminAddress: string,
  safetyModuleNewImplAddress: string,
  safetyModuleRecoveryAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const governor = await new DydxGovernor__factory(deployer).attach(governorAddress);

  // Give tokens to the deployer that it can use to create and vote on the proposal.
  const foundationAddress = getDeployConfig().TOKEN_ALLOCATIONS.DYDX_FOUNDATION.ADDRESS;
  const foundation = await impersonateAndFundAccount(foundationAddress);
  const dydxToken = new DydxToken__factory(foundation).attach(dydxTokenAddress);
  const balance = await dydxToken.balanceOf(foundationAddress);
  await dydxToken.transfer(deployer.address, balance);

  log('Creating proposal');
  const { proposalId } = await createSafetyModuleRecoveryProposal({
    proposalIpfsHashHex: MOCK_PROPOSAL_IPFS_HASH,
    governorAddress,
    longTimelockAddress,
    safetyModuleAddress,
    safetyModuleProxyAdminAddress,
    safetyModuleNewImplAddress,
    safetyModuleRecoveryAddress,
  });

  log('Waiting for voting to begin');
  for (let i = 0; i < deployConfig.VOTING_DELAY_BLOCKS; i++) {
    if (i > 0 && i % 2000 === 0) {
      log('mining', i);
    }
    await advanceBlock();
  }

  log('Submitting vote');
  await waitForTx(await governor.submitVote(proposalId, true));

  log('Waiting for voting to end');
  for (let i = 0; i < deployConfig.LONG_TIMELOCK_CONFIG.VOTING_DURATION_BLOCKS; i++) {
    if (i > 0 && i % 2000 === 0) {
      log('mining', i);
    }
    await advanceBlock();
  }

  log('Queueing the proposal');
  await waitForTx(await governor.queue(proposalId));
  const delaySeconds = deployConfig.LONG_TIMELOCK_CONFIG.DELAY;
  await increaseTimeAndMine(delaySeconds);

  log('Executing the proposal');
  await waitForTx(await governor.execute(proposalId));
  log('Proposal executed');

  log('\n=== SAFETY MODULE RECOVERY COMPLETE ===\n');
}

export async function executeSafetyModuleUpgradeNoProposal({
  longTimelockAddress,
  safetyModuleAddress,
  safetyModuleProxyAdminAddress,
  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
}: {
  longTimelockAddress: string,
  safetyModuleAddress: string,
  safetyModuleProxyAdminAddress: string,
  safetyModuleNewImplAddress: string,
  safetyModuleRecoveryAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();

  // NOTE: On mainnet, the upgrade and the call to the initializer are performed atomically
  // via a governance proposal. It's important that these steps are atomic or else the
  // initializer can be called to extract funds from the contract.
  const mockLongTimelock = await impersonateAndFundAccount(longTimelockAddress);
  const safetyModuleProxyAdmin = new ProxyAdmin__factory(mockLongTimelock).attach(
    safetyModuleProxyAdminAddress,
  );
  const initializeCalldata = new Interface(SafetyModuleV2__factory.abi).encodeFunctionData(
    'initialize',
    [
      safetyModuleRecoveryAddress,
      deployConfig.SM_RECOVERY_COMPENSATION_AMOUNT,
    ],
  );
  await waitForTx(
    await safetyModuleProxyAdmin.upgradeAndCall(
      safetyModuleAddress,
      safetyModuleNewImplAddress,
      initializeCalldata,
    ),
  );

  log('\n=== SAFETY MODULE RECOVERY COMPLETE ===\n');
}
