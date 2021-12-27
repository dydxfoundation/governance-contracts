import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';

import { timeLatest, evmSnapshot, evmRevert, increaseTimeAndMine } from '../../../helpers/misc-utils';
import {
  BLACKOUT_WINDOW,
  EPOCH_LENGTH,
  MAX_BLACKOUT_LENGTH,
  MAX_EPOCH_LENGTH,
  MIN_BLACKOUT_LENGTH,
  MIN_EPOCH_LENGTH,
  ZERO_ADDRESS,
  ONE_DAY,
} from '../../../helpers/constants';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { StakingHelper } from '../../test-helpers/staking-helper';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';

const snapshots = new Map<string, string>();

// Snapshots
const afterMockTokenMint = 'AfterMockTokenMint';
const afterEpochZero = 'AfterEpochZero';
const inBlackoutWindow = 'InBlackoutWindow';
const borrowerAllocationsSet = 'BorrowerAllocationsSet';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1Admin', deployPhase2, (testEnv: TestEnv) => {
  let liquidityStakingV1: LiquidityStakingV1;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: SignerWithAddress[];
  let otherUser: SignerWithAddress;

  let distributionStart: BigNumber;
  let distributionEnd: BigNumber;
  let initialOffset: BigNumber;

  let contract: StakingHelper;

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStaking;

    // Users.
    stakers = testEnv.users.slice(1, 3); // 2 stakers
    borrowers = testEnv.users.slice(3, 5); // 2 borrowers
    otherUser = testEnv.users[5];

    distributionStart = await liquidityStakingV1.DISTRIBUTION_START();
    distributionEnd = await liquidityStakingV1.DISTRIBUTION_END();

    const epochParams: {
      interval: BigNumber,
      offset: BigNumber,
    } = await liquidityStakingV1.getEpochParameters();

    initialOffset = epochParams.offset;

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStakingV1,
      testEnv.mockStakedToken,
      testEnv.rewardsTreasury,
      testEnv.deployer,
      testEnv.deployer,
      stakers.concat(borrowers),
      false,
    );

    // Mint staked tokens and set allowances.
    await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));
    await Promise.all(borrowers.map((b) => contract.approveContract(b, stakerInitialBalance)));

    saveSnapshot(afterMockTokenMint);
  });

  describe('Before epoch zero has started', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it("Can set valid epoch & blackout parameters which don't jump past the start of epoch zero", async () => {
      const currentTime = await timeLatest();
      // Double epoch length.
      // We would now be in the blackout window, except that it doesn't apply before epoch zero.
      await contract.setEpochParameters(EPOCH_LENGTH.mul(2), initialOffset);
      // Increase epoch length to max.
      await contract.setEpochParameters(MAX_EPOCH_LENGTH, initialOffset);
      await expect(
        contract.setEpochParameters(MAX_EPOCH_LENGTH.add(1), initialOffset)
      ).to.be.revertedWith('LS1EpochSchedule: Epoch length too small');
      // Increase blackout window to max.
      await contract.setBlackoutWindow(MAX_BLACKOUT_LENGTH);
      await expect(contract.setBlackoutWindow(MAX_BLACKOUT_LENGTH.add(1))).to.be.revertedWith(
        'LS1EpochSchedule: Blackout window can be at most half the epoch length'
      );
      // Decrease blackout window to min.
      await contract.setBlackoutWindow(MIN_BLACKOUT_LENGTH);
      await expect(contract.setBlackoutWindow(MIN_BLACKOUT_LENGTH.sub(1))).to.be.revertedWith(
        'LS1EpochSchedule: Blackout window too large'
      );
      // Decrease epoch length to min.
      await contract.setEpochParameters(MIN_EPOCH_LENGTH, initialOffset);
      await expect(
        contract.setEpochParameters(MIN_EPOCH_LENGTH.sub(1), initialOffset)
      ).to.be.revertedWith(
        'LS1EpochSchedule: Blackout window can be at most half the epoch length'
      );
      // Set different offsets. Any offset should be valid as long as it's in the future.
      await contract.setEpochParameters(MIN_EPOCH_LENGTH, currentTime.plus(30).toString());
      await contract.setEpochParameters(MIN_EPOCH_LENGTH, currentTime.plus(100000).toString());
    });

    it('Cannot set epoch parameters which jump past the start of epoch zero', async () => {
      const currentTime = (await timeLatest()).toNumber();
      await expect(contract.setEpochParameters(EPOCH_LENGTH, currentTime)).to.be.revertedWith(
        'LS1Admin: Started epoch zero'
      );
      await expect(
        contract.setEpochParameters(EPOCH_LENGTH, currentTime - 10000)
      ).to.be.revertedWith('LS1Admin: Started epoch zero');
    });

    it('Can set the emission rate', async () => {
      await contract.setRewardsPerSecond(123);
    });

    it('Can set borrower allocations', async () => {
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
    });

    it('Can set partial allocation by assigning units to address(0)', async () => {
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.5,
        [borrowers[1].address]: 0.3,
        [ZERO_ADDRESS]: 0.2,
      });
    });

    it('Cannot set allocations which sum to greater than one', async () => {
      await expect(
        contract.setBorrowerAllocations({
          [borrowers[0].address]: 0.5,
          [borrowers[1].address]: 0.5001,
        })
      ).to.be.revertedWith('LS1BorrowerAllocations: Invalid');
    });

    it('Cannot set allocations which sum to less than one', async () => {
      await expect(
        contract.setBorrowerAllocations({
          [borrowers[0].address]: 0.5,
          [borrowers[1].address]: 0.4999,
        })
      ).to.be.revertedWith('LS1BorrowerAllocations: Invalid');
    });

    it('Cannot call with invalid params', async () => {
      await expect(liquidityStakingV1.setBorrowerAllocations([], [1])).to.be.revertedWith(
        'LS1Admin: Params length mismatch'
      );
    });
  });

  describe('After epoch zero has started', () => {
    before(async () => {
      await loadSnapshot(afterMockTokenMint);

      // Move us roughly midway into epoch 2 (right before blackout window).
      const newTimestamp = initialOffset.toNumber() + EPOCH_LENGTH.toNumber() * 2.49;
      await incrementTimeToTimestamp(newTimestamp);
      expect(await liquidityStakingV1.getCurrentEpoch()).to.equal(2);

      await saveSnapshot(afterEpochZero);
    });

    beforeEach(async () => {
      await loadSnapshot(afterEpochZero);
    });

    it('Can set epoch parameters which maintain current epoch and blackout status', async () => {
      //                               v now
      // Initial schedule:
      // |           |           |           |
      // 0           1           2           3
      //
      // New schedule:
      //                     |   |   |   |
      //                     0   1   2   3
      await contract.setBlackoutWindow(BLACKOUT_WINDOW.div(4)); // Can be at most half epoch length.
      await contract.setEpochParameters(
        EPOCH_LENGTH.div(3),
        initialOffset.add(EPOCH_LENGTH.mul(5).div(3))
      );
      //
      // New schedule:
      // |                       |                       |
      // 1                       2                       3
      await contract.setEpochParameters(
        EPOCH_LENGTH.mul(2),
        initialOffset.sub(EPOCH_LENGTH.mul(2))
      );
      // Another schedule, with epoch zero further in the past.
      await contract.setEpochParameters(
        EPOCH_LENGTH.mul(3),
        initialOffset.sub(EPOCH_LENGTH.mul(6))
      );
    });

    it('Cannot set epoch parameters which move us into the blackout window', async () => {
      // Change the offset to move us into the blackout window.
      await expect(
        contract.setEpochParameters(
          EPOCH_LENGTH,
          initialOffset.sub(EPOCH_LENGTH.div(2).sub(1000)) // Move us 1000 seconds before epoch end.
        )
      ).to.be.revertedWith('LS1Admin: End in blackout window');
    });

    it('Cannot set blackout parameters which move us into the blackout window', async () => {
      const newEpochLength: BigNumber = EPOCH_LENGTH.add(ONE_DAY.multipliedBy(2).toString());
      await contract.setEpochParameters(
        newEpochLength,
        initialOffset,
      );

      const midwayThroughEpoch2: BigNumber = initialOffset.add(newEpochLength.mul(5).div(2));
      await incrementTimeToTimestamp(midwayThroughEpoch2);

      // Expand the blackout window to include the current timestamp.
      await expect(contract.setBlackoutWindow(newEpochLength.div(2))).to.be.revertedWith(
        'LS1Admin: End in blackout window'
      );
    });

    it('Cannot set epoch parameters which decrease the current epoch number', async () => {
      // Change the offset by one epoch.
      await expect(
        contract.setEpochParameters(EPOCH_LENGTH, initialOffset.add(EPOCH_LENGTH))
      ).to.be.revertedWith('LS1Admin: Changed epochs');
    });

    it('Cannot set epoch parameters which increase the current epoch number', async () => {
      // Change the offset by one epoch.
      await expect(
        contract.setEpochParameters(EPOCH_LENGTH, initialOffset.sub(EPOCH_LENGTH))
      ).to.be.revertedWith('LS1Admin: Changed epochs');
    });

    it('Cannot set epoch parameters which put us before epoch zero', async () => {
      // Change the offset by one epoch.
      await expect(
        contract.setEpochParameters(EPOCH_LENGTH, initialOffset.add(EPOCH_LENGTH.mul(10)))
      ).to.be.revertedWith('LS1EpochSchedule: Epoch zero has not started');
    });

    it('Can set the emission rate', async () => {
      await contract.setRewardsPerSecond(123);
    });

    it('Can set borrower allocations', async () => {
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
    });

    it('Can set partial allocation by assigning units to address(0)', async () => {
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.5,
        [borrowers[1].address]: 0.3,
        [ZERO_ADDRESS]: 0.2,
      });
    });

    it('Cannot set allocations which sum to greater than one', async () => {
      await expect(
        contract.setBorrowerAllocations({
          [borrowers[0].address]: 0.5,
          [borrowers[1].address]: 0.5001,
        })
      ).to.be.revertedWith('LS1BorrowerAllocations: Invalid');
    });
  });

  describe('While in the blackout window', () => {
    before(async () => {
      await loadSnapshot(afterMockTokenMint);

      // Move us to the middle of the blackout window of epoch 2.
      const newTimestamp =
        initialOffset.toNumber() + EPOCH_LENGTH.toNumber() * 3 - BLACKOUT_WINDOW.toNumber() / 2;
      await incrementTimeToTimestamp(newTimestamp);
      expect(await liquidityStakingV1.getCurrentEpoch()).to.equal(2);
      expect(await liquidityStakingV1.inBlackoutWindow()).to.be.true;

      await saveSnapshot(inBlackoutWindow);
    });

    beforeEach(async () => {
      await loadSnapshot(inBlackoutWindow);
    });

    it('Cannot set epoch parameters', async () => {
      await expect(contract.setEpochParameters(EPOCH_LENGTH, initialOffset)).to.be.revertedWith(
        'LS1Admin: Blackout window'
      );
    });

    it('Cannot set blackout window', async () => {
      await expect(contract.setBlackoutWindow(BLACKOUT_WINDOW)).to.be.revertedWith(
        'LS1Admin: Blackout window'
      );
    });

    it('Cannot update borrower allocations', async () => {
      await expect(contract.setBorrowerAllocations({})).to.be.revertedWith(
        'LS1Admin: Blackout window'
      );
    });

    it('Can set the emission rate', async () => {
      await contract.setRewardsPerSecond(123);
    });
  });

  describe('after borrower allocations are set', async () => {
    before(async () => {
      await loadSnapshot(afterMockTokenMint);

      // Set allocations and move to the start of epoch zero.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
      await incrementTimeToTimestamp(initialOffset);

      await saveSnapshot(borrowerAllocationsSet);
    });

    beforeEach(async () => {
      await loadSnapshot(borrowerAllocationsSet);
    });

    it('can set and remove borrowing restrictions', async () => {
      // Initial stake and borrow.
      await contract.stake(stakers[0], stakerInitialBalance);
      await contract.borrow(borrowers[0], stakerInitialBalance * 0.4);

      // Restrict both borrowers.
      await contract.setBorrowingRestriction(borrowers[0], true);
      await contract.setBorrowingRestriction(borrowers[1], true);

      // Expect borrower 1 cannot borrow.
      await expect(contract.borrow(borrowers[1], 1)).to.be.revertedWith(
        'LS1Borrowing: Restricted'
      );
      expect(await liquidityStakingV1.getBorrowableAmount(borrowers[1].address)).to.equal(0);

      // Expect borrower 0 can repay, but then cannot borrow.
      await contract.repayBorrow(borrowers[0], borrowers[0], stakerInitialBalance * 0.2);
      await expect(contract.borrow(borrowers[0], 1)).to.be.revertedWith(
        'LS1Borrowing: Restricted'
      );

      // Release restriction on borrower 0.
      await contract.setBorrowingRestriction(borrowers[0], false);

      // Only borrower 0 can borrow.
      await contract.borrow(borrowers[0], stakerInitialBalance * 0.2);
      await expect(contract.borrow(borrowers[1], 1)).to.be.revertedWith(
        'LS1Borrowing: Restricted'
      );
    });
  });

  async function saveSnapshot(label: string): Promise<void> {
    snapshots.set(label, await evmSnapshot());
    contract.saveSnapshot(label);
  }

  async function loadSnapshot(label: string): Promise<void> {
    const snapshot = snapshots.get(label);
    if (!snapshot) {
      throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
    }
    await evmRevert(snapshot);
    snapshots.set(label, await evmSnapshot());
    contract.loadSnapshot(label);
  }
});

async function incrementTimeToTimestamp(timestampString: BigNumberish): Promise<void> {
  const latestBlockTimestamp = (await timeLatest()).toNumber();
  const timestamp = BigNumber.from(timestampString);
  // we can only increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp).to.be.at.most(timestamp.toNumber());
  const timestampDiff = timestamp.sub(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
