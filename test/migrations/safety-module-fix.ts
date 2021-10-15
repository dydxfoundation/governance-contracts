import BNJS from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { Interface } from 'ethers/lib/utils';

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { log } from '../../src/lib/logging';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { createSafetyModuleFixProposal } from '../../src/migrations/safety-module-fix-proposal';
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
}: {
  dydxTokenAddress: string,
  governorAddress: string,
  longTimelockAddress: string,
  safetyModuleAddress: string,
  safetyModuleProxyAdminAddress: string,
  safetyModuleNewImplAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);

  // Pick a voter with enough tokens to meet the quorum requirement.
  const voterAddress = deployConfig.TOKEN_ALLOCATIONS.DYDX_TRADING.ADDRESS;
  const voter = await impersonateAndFundAccount(voterAddress);
  const voterBalance = await dydxToken.balanceOf(voterAddress);

  if (voterBalance.lt(new BNJS('1e26').toFixed())) {
    throw new Error('Not enough votes to pass the proposal.');
  }

  // Vote on an existing proposal (can be used with mainnet forking).
  let proposalId: BigNumberish;

  if (config.SM_FIX_PROPOSAL_ID !== null) {
    proposalId = config.SM_FIX_PROPOSAL_ID;
  } else {
    log('Creating proposal');
    ({ proposalId } = await createSafetyModuleFixProposal({
      proposalIpfsHashHex: MOCK_PROPOSAL_IPFS_HASH,
      governorAddress,
      longTimelockAddress,
      safetyModuleAddress,
      safetyModuleProxyAdminAddress,
      safetyModuleNewImplAddress,
      signer: voter,
    }));

    log('Waiting for voting to begin');
    for (let i = 0; i < deployConfig.VOTING_DELAY_BLOCKS + 1; i++) {
      if (i > 0 && i % 2000 === 0) {
        log('mining', i);
      }
      await advanceBlock();
    }
  }

  let proposalState = await governor.getProposalState(proposalId);
  if (proposalState !== 2) {
    throw new Error('Expected proposal to be in the voting phase.');
  }

  log('Submitting vote');
  await waitForTx(await governor.connect(voter).submitVote(proposalId, true));

  log('Waiting for voting to end');
  let minedCount = 0;
  for (;;) {
    for (let i = 0; i < 2000; i++) {
      await advanceBlock();
      minedCount++;
    }
    log('mining', minedCount);
    proposalState = await governor.getProposalState(proposalId);
    if (proposalState !== 2) {
      break;
    }
  }

  if (proposalState !== 4) {
    throw new Error(`Expected proposal to have succeeded but state was ${proposalState}`);
  }

  log('Queueing the proposal');
  await waitForTx(await governor.queue(proposalId));
  const delaySeconds = deployConfig.LONG_TIMELOCK_CONFIG.DELAY;
  await increaseTimeAndMine(delaySeconds);

  log('Executing the proposal');
  await waitForTx(await governor.execute(proposalId));
  log('Proposal executed');

  log('\n=== SAFETY MODULE FIX COMPLETE ===\n');
}

export async function executeSafetyModuleUpgradeNoProposal({
  longTimelockAddress,
  safetyModuleAddress,
  safetyModuleProxyAdminAddress,
  safetyModuleNewImplAddress,
}: {
  longTimelockAddress: string,
  safetyModuleAddress: string,
  safetyModuleProxyAdminAddress: string,
  safetyModuleNewImplAddress: string,
}): Promise<void> {
  // NOTE: On mainnet, the upgrade and the call to the initializer are performed atomically
  // via a governance proposal. It's important that these steps are atomic or else the
  // initializer can be called to extract funds from the contract.
  const mockLongTimelock = await impersonateAndFundAccount(longTimelockAddress);
  const safetyModuleProxyAdmin = new ProxyAdmin__factory(mockLongTimelock).attach(
    safetyModuleProxyAdminAddress,
  );
  const initializeCalldata = new Interface(SafetyModuleV2__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );
  await waitForTx(
    await safetyModuleProxyAdmin.upgradeAndCall(
      safetyModuleAddress,
      safetyModuleNewImplAddress,
      initializeCalldata,
    ),
  );

  log('\n=== SAFETY MODULE FIX COMPLETE ===\n');
}
