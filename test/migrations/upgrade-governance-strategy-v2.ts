import BNJS from 'bignumber.js';
import { BigNumberish } from 'ethers';

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { DIP_26_IPFS_HASH } from '../../src/lib/constants';
import { log } from '../../src/lib/logging';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import {
  DydxGovernor__factory,
  DydxToken__factory,
} from '../../types';
import { advanceBlock, increaseTimeAndMine } from '../helpers/evm';
import { createUpgradeGovernanceStrategyV2Proposal } from '../../src/migrations/upgrade-governance-strategy-v2';

export async function executeUpgradeGovernanceStrategyV2ViaProposal({
  dydxTokenAddress,
  governorAddress,
  governanceStrategyV2Address,
  longTimelockAddress,
}: {
  dydxTokenAddress: string,
  governorAddress: string,
  governanceStrategyV2Address: string,
  longTimelockAddress: string,
}) {
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

  if (config.UPGRADE_GOVERNANCE_STRATEGY_PROPOSAL_ID !== null) {
    proposalId = config.UPGRADE_GOVERNANCE_STRATEGY_PROPOSAL_ID;
  } else {
    log('Creating proposal');
    ({ proposalId } = await createUpgradeGovernanceStrategyV2Proposal({
      proposalIpfsHashHex: DIP_26_IPFS_HASH,
      governorAddress,
      longTimelockAddress,
      governanceStrategyV2Address,
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

  log('\n=== UPGRADE GOVERNANCE STRATEGY V2 COMPLETE ===\n');
}

export async function executeUpgradeGovernanceStrategyV2NoProposal({
  governorAddress,
  governanceStrategyV2Address,
  longTimelockAddress,
}: {
  governorAddress: string,
  governanceStrategyV2Address: string,
  longTimelockAddress: string,
}): Promise<void> {
  const mockLongTimelock = await impersonateAndFundAccount(longTimelockAddress);
  const governor = new DydxGovernor__factory(mockLongTimelock).attach(governorAddress);

  await waitForTx(
    await governor.setGovernanceStrategy(governanceStrategyV2Address),
  );

  log('\n=== UPGRADE GOVERNANCE STRATEGY V2 COMPLETE ===\n');
}
