import { BigNumber, BigNumberish } from 'ethers';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';
import {
  timeLatest,
  evmSnapshot,
  evmRevert,
  increaseTimeAndMine,
} from '../../../helpers/misc-utils';
import { StakingHelper } from '../../test-helpers/staking-helper';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../../types/MintableErc20';
import { expect } from 'chai';
import { StarkProxyV1 } from '../../../types/StarkProxyV1';
import { MockStarkPerpetual } from '../../../types/MockStarkPerpetual';

// Snapshots
const snapshots = new Map<string, string>();
const fundsStakedSnapshot = 'FundsStaked';
const borrowerHasBorrowed = 'BorrowerHasBorrowed';
const borrowerAmountDue = 'BorrowerAmountDue';
const borrowerRestrictedSnapshot = 'BorrowerRestrictedSnapshot';

const stakerInitialBalance: number = 1_000_000;

makeSuite('SP1Exchange', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let liquidityStaking: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let mockStarkPerpetual: MockStarkPerpetual;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: StarkProxyV1[];

  let distributionStart: number;
  let expectedAllocations: number[];

  let contract: StakingHelper;

  before(async () => {
    ({
      rewardsTreasury,
      liquidityStaking,
      mockStakedToken,
      mockStarkPerpetual,
      deployer,
    } = testEnv);

    // Users.
    stakers = testEnv.users.slice(1, 3); // 2 stakers
    borrowers = testEnv.starkProxyV1Borrowers;

    // Grant roles.
    const exchangeOperatorRole = await borrowers[0].EXCHANGE_OPERATOR_ROLE();
    const borrowerRole = await borrowers[0].BORROWER_ROLE();
    await Promise.all(borrowers.map(async b => {
      await b.grantRole(exchangeOperatorRole, deployer.address);
      await b.grantRole(borrowerRole, deployer.address);
    }));

    distributionStart = (await liquidityStaking.DISTRIBUTION_START()).toNumber();

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStaking,
      mockStakedToken,
      rewardsTreasury,
      deployer,
      deployer,
      stakers.concat(borrowers),
      false,
    );

    // Mint staked tokens and set allowances.
    await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));

    // Initial stake of 1M.
    await incrementTimeToTimestamp(distributionStart);
    await contract.stake(stakers[0], stakerInitialBalance / 4);
    await contract.stake(stakers[1], (stakerInitialBalance / 4) * 3);
    saveSnapshot(fundsStakedSnapshot);
  });

  describe('Borrower, after borrowing funds', () => {
    before(async () => {
      await loadSnapshot(fundsStakedSnapshot);

      // Allocations: [40%, 60%]
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
      expectedAllocations = [stakerInitialBalance * 0.4, stakerInitialBalance * 0.6];

      // Borrow full amount.
      await contract.elapseEpoch();
      await contract.fullBorrowViaProxy(borrowers[0], stakerInitialBalance * 0.4);
      expect(await mockStakedToken.balanceOf(borrowers[0].address)).to.equal(
        stakerInitialBalance * 0.4
      );

      await saveSnapshot(borrowerHasBorrowed);
    });

    describe('interacting with the exchange', () => {
      const starkKey = 123;

      beforeEach(async () => {
        await loadSnapshot(borrowerHasBorrowed);
      });

      it('can add a STARK key that is registered to the StarkProxy contract', async () => {
        await mockStarkPerpetual.registerUser(borrowers[0].address, starkKey, []);
        await borrowers[0].allowStarkKey(starkKey);
      });

      it('cannot add a STARK key that is not registered', async () => {
        await expect(borrowers[0].allowStarkKey(starkKey)).to.be.revertedWith(
          'USER_UNREGISTERED',
        );
      });

      it('cannot add a STARK key that is registered to another address', async () => {
        await mockStarkPerpetual.registerUser(borrowers[1].address, starkKey, []);
        await expect(borrowers[0].allowStarkKey(starkKey)).to.be.revertedWith(
          'SP1Owner: STARK key not registered to this contract',
        );
      });

      it('cannot deposit to a STARK key that has not been allowed', async () => {
        await mockStarkPerpetual.registerUser(borrowers[0].address, starkKey, []);
        await expect(borrowers[0].depositToExchange(starkKey, 0, 0, 0)).to.be.revertedWith(
          'SP1Storage: STARK key is not on the allowlist'
        );
      });

      it('cannot deposit to a STARK key that has been disallowed', async () => {
        await mockStarkPerpetual.registerUser(borrowers[0].address, starkKey, []);
        await borrowers[0].allowStarkKey(starkKey);
        await borrowers[0].disallowStarkKey(starkKey);
        await expect(borrowers[0].depositToExchange(starkKey, 0, 0, 0)).to.be.revertedWith(
          'SP1Storage: STARK key is not on the allowlist'
        );
      });

      it('can deposit and withdraw, and then repay', async () => {
        await mockStarkPerpetual.registerUser(borrowers[0].address, starkKey, []);
        await borrowers[0].allowStarkKey(starkKey);
        await borrowers[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.4);
        await borrowers[0].withdrawFromExchange(starkKey, 456);
        await contract.repayBorrowViaProxy(borrowers[0], stakerInitialBalance * 0.4);
      });
    });

    describe('after restricted by guardian', () => {
      const starkKey = 123;

      before(async () => {
        await loadSnapshot(borrowerHasBorrowed);

        // Register with the exchange.
        await mockStarkPerpetual.registerUser(borrowers[0].address, starkKey, []);

        // Restrict borrowing.
        await expect(
          borrowers[0].connect(testEnv.deployer.signer).guardianSetBorrowingRestriction(true)
        )
          .to.emit(borrowers[0], 'BorrowingRestrictionChanged')
          .withArgs(true);

        await saveSnapshot(borrowerRestrictedSnapshot);
      });

      beforeEach(async () => {
        await loadSnapshot(borrowerRestrictedSnapshot);
      });

      it('cannot deposit borrowed funds to the exchange', async () => {
        await borrowers[0].allowStarkKey(starkKey);
        await expect(
          borrowers[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.4)
        ).to.be.revertedWith(
          'SP1Borrowing: Cannot deposit borrowed funds to the exchange while Restricted'
        );
      });

      it('can still deposit own funds to the exchange', async () => {
        await borrowers[0].allowStarkKey(starkKey);

        // Transfer some funds directly to the StarkProxy contract.
        const ownFundsAmount = 12340;
        await mockStakedToken
          .connect(stakers[0].signer)
          .transfer(borrowers[0].address, ownFundsAmount);

        // Deposit own funds to the exchange.
        await borrowers[0].depositToExchange(starkKey, 456, 789, ownFundsAmount);

        // Cannot deposit any more.
        await expect(borrowers[0].depositToExchange(starkKey, 456, 789, 1)).to.be.revertedWith(
          'SP1Borrowing: Cannot deposit borrowed funds to the exchange while Restricted'
        );
      });
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
