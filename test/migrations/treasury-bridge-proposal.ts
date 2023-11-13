import BNJS from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { Interface } from 'ethers/lib/utils';

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { DIP_29_IPFS_HASH, EXPECTED_AVG_BLOCKTIME_LOWER_BOUND_S } from '../../src/lib/constants';
import { log } from '../../src/lib/logging';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import {
  DydxGovernor__factory,
  DydxToken__factory,
  ProxyAdmin__factory,
  TreasuryBridge__factory,
  TreasuryVester__factory,
} from '../../types';
import { advanceBlock, increaseTimeAndMine, latestBlockTimestamp } from '../helpers/evm';
import { createTreasuryBridgeProposal } from '../../src/migrations/treasury-bridge-proposal';

export async function executeTreasuryBridgeViaProposal({
  dydxTokenAddress,
  wrappedDydxTokenAddress,
  governorAddress,
  shortTimelockAddress,
  rewardsTreasuryAddress,
  communityTreasuryAddress,
  rewardsTreasuryProxyAdminAddress,
  communityTreasuryProxyAdminAddress,
  rewardsTreasuryVesterAddress,
  communityTreasuryVesterAddress,
  rewardsTreasuryBridgeAddress,
  communityTreasuryBridgeAddress,
}: {
  dydxTokenAddress: string,
  wrappedDydxTokenAddress: string,
  governorAddress: string,
  shortTimelockAddress: string,
  rewardsTreasuryAddress: string,
  communityTreasuryAddress: string,
  rewardsTreasuryProxyAdminAddress: string,
  communityTreasuryProxyAdminAddress: string,
  rewardsTreasuryVesterAddress: string,
  communityTreasuryVesterAddress: string,
  rewardsTreasuryBridgeAddress: string,
  communityTreasuryBridgeAddress: string,
}) {
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);

  // Pick a voter with enough tokens to meet the quorum requirement.
  const voterAddress = '0xe1bb2bbd0e58dc86e314f855351b0bcc296164bd';
  const voter = await impersonateAndFundAccount(voterAddress);
  const voterBalance = await dydxToken.balanceOf(voterAddress);

  if (voterBalance.lt(new BNJS('1e26').toFixed())) {
    throw new Error('Not enough votes to pass the proposal.');
  }

  // Vote on an existing proposal (can be used with mainnet forking).
  let proposalId: BigNumberish;

  // Define the expected current block timestamp. Note we expect this to increase
  // by a lower-bounded average each block.
  let expectedCurrentBlockTimestamp: number = await latestBlockTimestamp();
  expectedCurrentBlockTimestamp += EXPECTED_AVG_BLOCKTIME_LOWER_BOUND_S;

  if (config.UPGRADE_GOVERNANCE_STRATEGY_PROPOSAL_ID !== null) {
    proposalId = config.UPGRADE_GOVERNANCE_STRATEGY_PROPOSAL_ID;
  } else {
    log('Creating proposal');
    ({ proposalId } = await createTreasuryBridgeProposal({
      proposalIpfsHashHex: DIP_29_IPFS_HASH,
      dydxTokenAddress,
      wrappedDydxTokenAddress,
      governorAddress,
      shortTimelockAddress,
      rewardsTreasuryAddress,
      communityTreasuryAddress,
      rewardsTreasuryProxyAdminAddress,
      communityTreasuryProxyAdminAddress,
      rewardsTreasuryVesterAddress,
      communityTreasuryVesterAddress,
      rewardsTreasuryBridgeAddress,
      communityTreasuryBridgeAddress,
      signer: voter,
    }));

    log('Waiting for voting to begin');
    for (let i = 0; i < deployConfig.VOTING_DELAY_BLOCKS + 1; i++) {
      if (i > 0 && i % 2000 === 0) {
        log('mining', i);
      }
      await advanceBlock(Math.floor(expectedCurrentBlockTimestamp));
      expectedCurrentBlockTimestamp += EXPECTED_AVG_BLOCKTIME_LOWER_BOUND_S;
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
  for (let i = 0; i < deployConfig.SHORT_TIMELOCK_CONFIG.VOTING_DURATION_BLOCKS + 1; i++) {
    await advanceBlock(Math.floor(expectedCurrentBlockTimestamp));
    expectedCurrentBlockTimestamp += EXPECTED_AVG_BLOCKTIME_LOWER_BOUND_S;
    minedCount++;
  }

  proposalState = await governor.getProposalState(proposalId);
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

  log('\n=== TREASURY BRIDGE COMPLETE ===\n');
}

export async function executeTreasuryBridgeNoProposal({
  governorAddress,
  shortTimelockAddress,
  rewardsTreasuryAddress,
  communityTreasuryAddress,
  rewardsTreasuryProxyAdminAddress,
  communityTreasuryProxyAdminAddress,
  rewardsTreasuryBridgeAddress,
  communityTreasuryBridgeAddress,
}: {
  governorAddress: string,
  shortTimelockAddress: string,
  rewardsTreasuryAddress: string,
  communityTreasuryAddress: string,
  rewardsTreasuryProxyAdminAddress: string,
  communityTreasuryProxyAdminAddress: string,
  rewardsTreasuryBridgeAddress: string,
  communityTreasuryBridgeAddress: string,
}): Promise<void> {
  const mockShortTimelock = await impersonateAndFundAccount(shortTimelockAddress);

  const rewardsTreasuryProxyAdmin = new ProxyAdmin__factory(mockShortTimelock).attach(
    rewardsTreasuryProxyAdminAddress,
  );
  const rewardsTreasuryInitializeCalldata = new Interface(TreasuryBridge__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );
  await waitForTx(
    await rewardsTreasuryProxyAdmin.upgradeAndCall(
      rewardsTreasuryAddress,
      rewardsTreasuryBridgeAddress,
      rewardsTreasuryInitializeCalldata,
    ),
  );

  const communityTreasuryProxyAdmin = new ProxyAdmin__factory(mockShortTimelock).attach(
    communityTreasuryProxyAdminAddress,
  );
  const communityTreasuryInitializeCalldata = new Interface(TreasuryBridge__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );
  await waitForTx(
    await communityTreasuryProxyAdmin.upgradeAndCall(
      communityTreasuryAddress,
      communityTreasuryBridgeAddress,
      communityTreasuryInitializeCalldata,
    ),
  );

  log('\n=== TREASURY BRIDGE COMPLETE ===\n');
}
