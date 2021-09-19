import BNJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, BigNumberish, utils } from 'ethers';
import _ from 'lodash';

import { SM_EXCHANGE_RATE_BASE } from '../../src/lib/constants';
import { asBytes32, asUintHex, concatHex } from '../../src/lib/hex';
import { TestContext, describeContract } from '../helpers/describe-contract';
import { getAffectedStakersForTest } from '../helpers/get-affected-stakers-for-test';
import hre from '../hre';

let testStakers: string[];

function init() {
  testStakers = getAffectedStakersForTest();
}

describeContract('SafetyModuleV2 initial storage slots', init, (ctx: TestContext) => {

  it('0–49: AccessControlUpgradeable', async () => {
    await expectZeroes(_.range(0, 50));
  });

  it('50: ReentrancyGuard', async () => {
    expect(await read(50)).to.equal(1);
  });

  it('51–101: VersionedInitializable', async () => {
    expect(await read(51)).to.equal(2);
    await expectZeroes(_.range(52, 102));
  });

  it('102–127: SM1Storage', async () => {
    // Slot 102 and 103: Epoch parameters.
    const expectedEpochParametersStruct = concatHex([
      ctx.config.EPOCH_ZERO_START, // offset
      ctx.config.EPOCH_LENGTH, // interval
    ].map((n) => asUintHex(n, 128)));
    expect(await read(102)).to.equal(expectedEpochParametersStruct);
    expect(await read(103)).to.equal(ctx.config.BLACKOUT_WINDOW);
    await expectZeroes(_.range(104, 105));

    // Slot 105: Domain separator hash.
    expect((await read(105)).eq(0)).to.be.false();
    await expectZeroes(_.range(106, 113));

    // Slot 113: Rewards per second.
    expect(await read(113)).to.equal(ctx.config.SM_REWARDS_PER_SECOND);

    // Slot 114: Global index value and timestamp.
    const stakedFilter = ctx.safetyModule.filters.Staked();
    const stakedLogs = await ctx.safetyModule.queryFilter(stakedFilter);
    const lastStakeLog = stakedLogs[stakedLogs.length - 1];
    const lastStakeBlock = await lastStakeLog.getBlock();
    const lastStakeTimestamp = lastStakeBlock.timestamp;
    const expectedIndexAndTimestamp = concatHex([
      asUintHex(lastStakeTimestamp, 32), // timestamp
      asUintHex(0, 224), // index
    ]);
    expect(await read(114)).to.equal(expectedIndexAndTimestamp);
    await expectZeroes(_.range(115, 119));

    // Slot 119: Total active balance (current epoch).
    expect(await read(119)).to.equal(1);
    await expectZeroes(_.range(120, 124));

    // Slot 115: Exchange rate.
    expect(await read(124)).to.equal(new BNJS(SM_EXCHANGE_RATE_BASE).toString());
    await expectZeroes(_.range(125, 200));
  });

  it('Mappings', async () => {
    // Check mappings for just a few of the affected stakers.
    const stakersToCheck = testStakers.slice(0, 3);
    for (const staker of stakersToCheck) {
      const stakedFilter = ctx.safetyModule.filters.Staked(staker);
      const stakedLogs = await ctx.safetyModule.queryFilter(stakedFilter);
      expect(stakedLogs.length).to.equal(1);
      const stakeLog = stakedLogs[0];
      const stakeBlock = await stakeLog.getBlock();
      const stakeBlockNumber = stakeBlock.number;

      // Expect _VOTING_SNAPSHOTS_[staker].blockNumber to be the block number in which the staker
      // staked funds.
      const votingSnapshotBlockNumberSlot = utils.keccak256(concatHex([
        asUintHex(0, 256),
        utils.keccak256(concatHex([
          asBytes32(staker),
          asUintHex(107, 256),
        ])),
      ]));
      expect(await read(votingSnapshotBlockNumberSlot)).to.equal(stakeBlockNumber);

      // Expect _PROPOSITION_SNAPSHOTS_[staker].blockNumber to be the block number in which the staker
      // staked funds.
      const propositionSnapshotBlockNumberSlot = utils.keccak256(concatHex([
        asUintHex(0, 256),
        utils.keccak256(concatHex([
          asBytes32(staker),
          asUintHex(110, 256),
        ])),
      ]));
      expect(await read(propositionSnapshotBlockNumberSlot)).to.equal(stakeBlockNumber);

      // Expect _VOTING_SNAPSHOT_COUNTS_[staker] to be set to 1 for each staker.
      const votingSnapshotCountSlot = utils.keccak256(concatHex([
        asBytes32(staker),
        asUintHex(108, 256),
      ]));
      expect(await read(votingSnapshotCountSlot)).to.equal(1);

      // Expect _PROPOSITION_SNAPSHOT_COUNTS_[staker] to be set to 1 for each staker.
      const propositionSnapshotCountSlot = utils.keccak256(concatHex([
        asBytes32(staker),
        asUintHex(111, 256),
      ]));
      expect(await read(propositionSnapshotCountSlot)).to.equal(1);

      // Expect _ACTIVE_BALANCES_[staker].currentEpoch to be set to 1 for each staker.
      const activeBalanceCurrentEpochSlot = utils.keccak256(concatHex([
        asBytes32(staker),
        asUintHex(118, 256),
      ]));
      expect(await read(activeBalanceCurrentEpochSlot)).to.equal(1);
    }
  });

  async function expectZeroes(
    range: number[],
  ): Promise<void> {
    for (const i of range) {
      expect(await read(i)).to.equal(0);
    }
  }

  async function readHex(
    slot: BigNumberish,
  ): Promise<string> {
    return hre.ethers.provider.getStorageAt(ctx.safetyModule.address, BigNumber.from(slot));
  }

  async function read(
    slot: BigNumberish,
  ): Promise<BigNumber> {
    return BigNumber.from(await readHex(BigNumber.from(slot)));
  }
});
