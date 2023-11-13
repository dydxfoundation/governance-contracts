import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Interface } from 'ethers/lib/utils';

import {
  DydxGovernor,
  DydxGovernor__factory,
  DydxToken__factory,
  Executor,
  Executor__factory,
  TreasuryBridge__factory,
  TreasuryVester,
  TreasuryVester__factory,
} from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { Proposal } from '../types';
import { COMMUNITY_TREASURY_DYDX_CHAIN_ADDRESS_BYTES, EXPECTED_AVG_BLOCKTIME_LOWER_BOUND_S } from '../lib/constants';
import { getDeployConfig } from '../deploy-config';
import { BigNumber } from 'ethers';

export async function createTreasuryBridgeProposal({
  proposalIpfsHashHex,
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
  signer,
  logCalldata = false,
}: {
  proposalIpfsHashHex: string,
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
  signer?: SignerWithAddress,
  logCalldata?: boolean,
}) {
  const hre = getHre();
  const deployer = signer || await getDeployerSigner();
  const deployerAddress = deployer.address;
  const deployConfig = getDeployConfig();

  if (logCalldata) {
    log(`Logging out calldata for treasury bridge proposal.\n`);
  } else {
    log(`Creating treasury bridge proposal with proposer ${deployerAddress}\n`);
  }

  const dydxToken = new DydxToken__factory(deployer).attach(dydxTokenAddress);
  const governor = new DydxGovernor__factory(deployer).attach(governorAddress);
  const shortTimelock = new Executor__factory(deployer).attach(shortTimelockAddress);
  const minProposalExecutionDelaySeconds = await getShortTimelockMinProposalExecutionDelaySeconds(governor, shortTimelock);

  const lastBlockUnixTimestamp = (await hre.ethers.provider.getBlock('latest')).timestamp;

  // Calculate the amount to bridge from the rewards treasury. Note the total balance bridged from the
  // rewards treasury should be less-than-or-equal-to the unallocated rewards.
  const rewardsTreasuryVester = new TreasuryVester__factory(deployer).attach(rewardsTreasuryVesterAddress);
  const expectedLowerBoundRewardsTreasuryVestedRewards: BigNumber = await calculateExpectedVestedRewardsAfterProposalExecutionDelay(
    rewardsTreasuryVester,
    minProposalExecutionDelaySeconds,
    lastBlockUnixTimestamp,
  );
  // The total funds bridged from the rewards treasury and rewards treasury vester must not exceed the unallocated
  // rewards. Therefore, estimate the upper bound of the rewards treasury vester balance and assume it was bridged.
  // Then the amount to bridge from the rewards treasury is equal to the following:
  // `deployConfig.UNALLOCATED_REWARDS_TO_BRIDGE_AMOUNT - expectedUpperBoundRewardsTreasuryVesterBalance`
  const rewardsTreasuryVesterBalance = await dydxToken.balanceOf(rewardsTreasuryVesterAddress);
  const expectedUpperBoundRewardsTreasuryVesterBalance = rewardsTreasuryVesterBalance.sub(expectedLowerBoundRewardsTreasuryVestedRewards);
  const rewardsTreasuryBridgeAmount = BigNumber.from(
    deployConfig.UNALLOCATED_REWARDS_TO_BRIDGE_AMOUNT,
  ).sub(expectedUpperBoundRewardsTreasuryVesterBalance);

  // Calculate the amount to bridge from the community treasury. Note this is an estimate since it's not
  // possible to know the exact amount of vested rewards at the time of proposal execution.
  const communityTreasuryVester = new TreasuryVester__factory(deployer).attach(communityTreasuryVesterAddress);
  const expectedLowerBoundCommunityTreasuryVestedRewards: BigNumber = await calculateExpectedVestedRewardsAfterProposalExecutionDelay(
    communityTreasuryVester,
    minProposalExecutionDelaySeconds,
    lastBlockUnixTimestamp,
  );
  const communityTreasuryBalance = await dydxToken.balanceOf(communityTreasuryAddress);
  const communityTreasuryBridgeAmount = communityTreasuryBalance.add(expectedLowerBoundCommunityTreasuryVestedRewards);

  const initializeCalldata = new Interface(TreasuryBridge__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );

  // Create the proposal. The proposal should do the following actions, in order:
  // 1. Upgrade the rewards treasury contract to the TreasuryBridge implementation contract.
  // 2. Upgrade the community treasury contract to the TreasuryBridge implementation contract.
  // 3. Approve the wrapped DYDX token contract to pull the necessary DYDX from the rewards treasury contract.
  // 4. Approve the wrapped DYDX token contract to pull the necessary DYDX from the community treasury contract.
  // 5. Bridge the approved funds from the rewards treasury to the DYDX chain community treasury.
  // 6. Bridge the approved funds from the community treasury to the DYDX chain community treasury.
  const proposalId = await governor.getProposalsCount();
  const proposal: Proposal = [
    shortTimelockAddress,
    [
      rewardsTreasuryProxyAdminAddress,
      communityTreasuryProxyAdminAddress,
      rewardsTreasuryAddress,
      communityTreasuryAddress,
      rewardsTreasuryAddress,
      communityTreasuryAddress,
    ],
    ['0', '0', '0', '0', '0', '0'],
    [
      'upgradeAndCall(address,address,bytes)',
      'upgradeAndCall(address,address,bytes)',
      'approve(address,address,uint256)',
      'approve(address,address,uint256)',
      'bridgeTreasury(uint256,bytes,bytes)',
      'bridgeTreasury(uint256,bytes,bytes)',
    ],
    [
        hre.ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bytes'],
            [rewardsTreasuryAddress, rewardsTreasuryBridgeAddress, initializeCalldata],
        ),
        hre.ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bytes'],
            [communityTreasuryAddress, communityTreasuryBridgeAddress, initializeCalldata],
        ),
        hre.ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'uint256'],
            [dydxTokenAddress, wrappedDydxTokenAddress, rewardsTreasuryBridgeAmount],
        ),
        hre.ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'uint256'],
            [dydxTokenAddress, wrappedDydxTokenAddress, communityTreasuryBridgeAmount],
        ),
        hre.ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'bytes', 'bytes'],
            [rewardsTreasuryBridgeAmount, COMMUNITY_TREASURY_DYDX_CHAIN_ADDRESS_BYTES, '0x'],
        ),
        hre.ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'bytes', 'bytes'],
            [communityTreasuryBridgeAmount, COMMUNITY_TREASURY_DYDX_CHAIN_ADDRESS_BYTES, '0x'],
        ),
    ],
    [false, false, false, false, false, false],
    proposalIpfsHashHex,
  ];
  log(`Rewards and community treasury data used for debugging created proposals:\n`);
  log(`Last Block Unix Timestamp: ${lastBlockUnixTimestamp}.`);
  log(`\nRewards treasury bridging metadata:`)
  log(`Unallocated rewards that can be bridged: ${deployConfig.UNALLOCATED_REWARDS_TO_BRIDGE_AMOUNT}`);
  log(`Current balance of Rewards Treasury Vester: ${rewardsTreasuryVesterBalance}.`);
  log(`Expected Lower Bound of Rewards Treasury Vested Rewards: ${expectedLowerBoundRewardsTreasuryVestedRewards}.`);
  log(`Amount to be bridged from Rewards Treasury: ${rewardsTreasuryBridgeAmount}.`);
  log(`\nCommunity treasury bridging metadata:`)
  log(`Current balance of Community Treasury: ${communityTreasuryBalance}.`);
  log(`Amount to be bridged from Community Treasury: ${communityTreasuryBridgeAmount}.`);
  log(`Expected Lower Bound of Community Treasury Vested Rewards: ${expectedLowerBoundCommunityTreasuryVestedRewards}.`);

  if (logCalldata) {
    const createProposalCalldata: string = new Interface(DydxGovernor__factory.abi).encodeFunctionData(
      'create',
      proposal,
    );
    log("\n=== BEGIN CALLDATA FOR CREATING THE TREASURY BRIDGE PROPOSAL === \n");
    log(createProposalCalldata);
    log("\n=== END CALLDATA ===\n");
  } else {
    await waitForTx(await governor.create(...proposal));
    log(`New treasury bridge proposal created with proposal ID: ${proposalId}`);
  }

  return {
    proposalId,
  };
}

// This function returns the estimated minimum delay between the creation and
// execution of a short timelock proposal.
async function getShortTimelockMinProposalExecutionDelaySeconds(
  governor: DydxGovernor,
  shortTimelock: Executor,
) {
  const delaySeconds = await shortTimelock.getDelay();
  const votingDurationBlocks = await shortTimelock.VOTING_DURATION();
  const voteDelayBlocks = await governor.getVotingDelay();

  const votingDurationAndDelayBlocks = votingDurationBlocks.add(voteDelayBlocks);

  const votingDurationAndDelaySeconds = Math.floor(
    votingDurationAndDelayBlocks.toNumber() * EXPECTED_AVG_BLOCKTIME_LOWER_BOUND_S
  );

  const totalDelaySeconds = delaySeconds.add(votingDurationAndDelaySeconds);

  return totalDelaySeconds;
}

// This function takes the minimum proposal execution delay in seconds along with the current block
// timestamp, and returns the minimum vested rewards when the proposal has executed.
async function calculateExpectedVestedRewardsAfterProposalExecutionDelay(
  treasuryVester: TreasuryVester,
  expectedProposalExecutionDelaySeconds: BigNumber,
  currentBlockUnixTimestamp: number,
): Promise<BigNumber> {
  const totalVestingAmount: BigNumber = await treasuryVester.vestingAmount();
  const lastUpdateUnixTimestamp: BigNumber = await treasuryVester.lastUpdate();
  const vestingEndUnixTimestamp: BigNumber = await treasuryVester.vestingEnd();
  const vestingBeginUnixTimestamp: BigNumber = await treasuryVester.vestingBegin();

  if (currentBlockUnixTimestamp < lastUpdateUnixTimestamp.toNumber()) {
    throw new Error(`Current block timestamp ${currentBlockUnixTimestamp} is before the last update timestamp ${lastUpdateUnixTimestamp.toNumber()}.`);
  }

  const estimatedEarliestProposalExecutionUnixTimestamp: BigNumber = expectedProposalExecutionDelaySeconds.add(currentBlockUnixTimestamp);

  // This logic for determining the vesting amount is mostly copied from the TreasuryVester contract:
  // https://github.com/dydxfoundation/governance-contracts/blob/18f2e9007831cab3e1c13cf8a29626ea4f416615/contracts/treasury/TreasuryVester.sol#L91
  const estimatedSecondsSinceLastVest: BigNumber = estimatedEarliestProposalExecutionUnixTimestamp.sub(lastUpdateUnixTimestamp);
  const totalVestingDurationSeconds: BigNumber = vestingEndUnixTimestamp.sub(vestingBeginUnixTimestamp);
  const vestedAmountAtProposalExecution: BigNumber = totalVestingAmount.mul(estimatedSecondsSinceLastVest).div(totalVestingDurationSeconds);

  return vestedAmountAtProposalExecution;
}
