import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor__factory, LiquidityStakingV1__factory,
} from '../../types';
import { Executor__factory } from '../../types/factories/Executor__factory';
import { ExecutorWithTimelockMixin__factory } from '../../types/factories/ExecutorWithTimelockMixin__factory';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { ONE_DAY_SECONDS, ONE_DAY_BLOCKS } from '../lib/constants';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';

export async function createWindDownBorrowingPoolProposal({
  proposalIpfsHashHex,
  governorAddress,
  shortTimelockAddress,
  liquidityModuleAddress,
  signer,
}: {
  proposalIpfsHashHex: string,
  governorAddress: string,
  shortTimelockAddress: string,
  liquidityModuleAddress: string,
  signer?: SignerWithAddress,
}) {
  const hre = getHre();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;

  const liquidityModule = new LiquidityStakingV1__factory(deployer).attach(liquidityModuleAddress);
  const shortTimelock = new Executor__factory(deployer).attach(shortTimelockAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);

  // Ensure the proposal will not be first executable within a blackout window.
  const [
    blackoutWindowLengthSeconds,
    epochParameters,
    timeRemainingInEpochSeconds,
    shortTimelockDelaySeconds,
    votingDurationBlocks,
    votingDelayBlocks,
    latestBlock,
  ] = await Promise.all([
    liquidityModule.getBlackoutWindow(),
    liquidityModule.getEpochParameters(),
    liquidityModule.getTimeRemainingInCurrentEpoch(),
    shortTimelock.getDelay(),
    shortTimelock.VOTING_DURATION(),
    governor.getVotingDelay(),
    await hre.ethers.provider.getBlock('latest'),
  ]);

  const latestTimestamp = latestBlock.timestamp;

  const votingDurationSeconds = votingDurationBlocks.toNumber() * ONE_DAY_SECONDS / ONE_DAY_BLOCKS;
  const votingDelaySeconds = votingDelayBlocks.toNumber() * ONE_DAY_SECONDS / ONE_DAY_BLOCKS;
  const earliestProposalPassTimestampSeconds = latestTimestamp +
    votingDelaySeconds +
    votingDurationSeconds +
    shortTimelockDelaySeconds.toNumber();

  const endOfEpochTimestamp = latestTimestamp + timeRemainingInEpochSeconds.toNumber();
  const nonBlackoutWindowLengthSeconds = epochParameters.interval.toNumber() - blackoutWindowLengthSeconds.toNumber();
  const proposalPassTimestampDiff = earliestProposalPassTimestampSeconds - endOfEpochTimestamp;

  // If the proposal will be passed in the current epoch, ensure it's before the blackout window.
  const isWithinCurrentEpochBlackoutWindow = proposalPassTimestampDiff < 0 &&
    Math.abs(proposalPassTimestampDiff) <= blackoutWindowLengthSeconds.toNumber();
  if (isWithinCurrentEpochBlackoutWindow) {
    throw new Error("This proposal will be executable within the current epoch's blackout window.");
  }

  // If the proposal will be passed in the next epoch, ensure it's before the blackout window.
  const isWithinNextEpochBlackoutWindow = proposalPassTimestampDiff > 0 &&
    proposalPassTimestampDiff >= nonBlackoutWindowLengthSeconds;
  if (isWithinNextEpochBlackoutWindow) {
    throw new Error("This proposal will be executable within the next epoch's blackout window.");
  }

  // Create the proposal.
  log(`Creating Wind Down Borrowing Pool proposal with proposer ${deployerAddress}.\n`);

  const threeDaysSeconds = ONE_DAY_SECONDS * 3;

  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    shortTimelockAddress,
    [liquidityModuleAddress, liquidityModuleAddress],
    ['0', '0'],
    [
      'setRewardsPerSecond(uint256)',
      'setBlackoutWindow(uint256)',
    ],
    [
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256'],
        [0],
      ),
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256'],
        [threeDaysSeconds],
      ),
    ],
    [false, false],
    proposalIpfsHashHex,
  ];

  await waitForTx(await governor.create(...proposal));

  return {
    proposalId,
  };
}
