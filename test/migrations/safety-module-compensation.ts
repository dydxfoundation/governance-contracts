import BNJS from 'bignumber.js';
import { BigNumberish } from 'ethers';

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { log } from '../../src/lib/logging';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { createSafetyModuleCompensationProposal } from '../../src/migrations/safety-module-compensation-proposal';
import {
  DydxGovernor__factory,
  DydxToken__factory,
  Treasury__factory,
} from '../../types';
import { advanceBlock, increaseTimeAndMine } from '../helpers/evm';

const MOCK_PROPOSAL_IPFS_HASH = (
  '0x0000000000000000000000000000000000000000000000000000000000000000'
);

export async function fundSafetyModuleRecoveryViaProposal({
  dydxTokenAddress,
  governorAddress,
  shortTimelockAddress,
  rewardsTreasuryAddress,
  safetyModuleRecoveryAddress,
}: {
  dydxTokenAddress: string,
  governorAddress: string,
  shortTimelockAddress: string,
  rewardsTreasuryAddress: string,
  safetyModuleRecoveryAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);

  // Pick a voter with enough tokens to meet the quorum requirement.
  const voterAddress = deployConfig.TOKEN_ALLOCATIONS.DYDX_TRADING.ADDRESS;
  const voter = await impersonateAndFundAccount(voterAddress);
  const voterBalance = await dydxToken.balanceOf(voterAddress);

  if (voterBalance.lt(new BNJS('2e25').toFixed())) {
    throw new Error('Not enough votes to pass the proposal.');
  }

  // Vote on an existing proposal (can be used with mainnet forking).
  let proposalId: BigNumberish;

  if (config.SM_COMPENSATION_PROPOSAL_ID !== null) {
    proposalId = config.SM_COMPENSATION_PROPOSAL_ID;
  } else {
    log('Creating proposal');
    ({ proposalId } = await createSafetyModuleCompensationProposal({
      proposalIpfsHashHex: MOCK_PROPOSAL_IPFS_HASH,
      dydxTokenAddress,
      governorAddress,
      shortTimelockAddress,
      rewardsTreasuryAddress,
      safetyModuleRecoveryAddress,
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
  const delaySeconds = deployConfig.SHORT_TIMELOCK_CONFIG.DELAY;
  await increaseTimeAndMine(delaySeconds);

  log('Executing the proposal');
  await waitForTx(await governor.execute(proposalId));
  log('Proposal executed');

  log('\n=== SAFETY MODULE COMPENSATION COMPLETE ===\n');
}

export async function fundSafetyModuleRecoveryNoProposal({
  dydxTokenAddress,
  shortTimelockAddress,
  rewardsTreasuryAddress,
  safetyModuleRecoveryAddress,
}: {
  dydxTokenAddress: string,
  shortTimelockAddress: string,
  rewardsTreasuryAddress: string,
  safetyModuleRecoveryAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();
  const mockShortTimelock = await impersonateAndFundAccount(shortTimelockAddress);
  const rewardsTreasury = new Treasury__factory(mockShortTimelock).attach(
    rewardsTreasuryAddress,
  );
  await waitForTx(
    await rewardsTreasury.transfer(
      dydxTokenAddress,
      safetyModuleRecoveryAddress,
      deployConfig.SM_RECOVERY_OWED_AMOUNT,
    ),
  );

  log('\n=== SAFETY MODULE COMPENSATION COMPLETE ===\n');
}
