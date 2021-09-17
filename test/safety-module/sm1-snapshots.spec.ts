import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import { DelegationType } from '../../src/types';
import { SafetyModuleV1 } from '../../types';
import { describeContract, TestContext } from '../helpers/describe-contract';
import {
  advanceBlock,
  increaseTimeAndMine,
  incrementTimeToTimestamp, latestBlock,
} from '../helpers/evm';

// Safety Module contract connected to the first user by default.
let safetyModule: SafetyModuleV1;

async function init(ctx: TestContext) {
  safetyModule = ctx.safetyModule.connect(ctx.users[0]);

  // Send tokens to first user.
  await ctx.dydxToken.transfer(ctx.users[0].address, 100_000_000);
  await ctx.dydxToken.connect(ctx.users[0]).approve(ctx.safetyModule.address, 100_000_000);

  // Elapse the token transfer restriction.
  await incrementTimeToTimestamp(ctx.config.TRANSFERS_RESTRICTED_BEFORE);
}

describeContract('Safety Module getPowerAtBlock()', init, (ctx: TestContext) => {

  it('Governance power is initially zero', async () => {
    await expectPowerAtBlock(ctx.users[0], 0, 0);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0);
    await expect(expectPowerRelativeBlock(ctx.users[0], 1, 0)).to.be.revertedWith(
      'SM1Snapshots: INVALID_BLOCK_NUMBER',
    );
  });

  it('Governance power increases by staking', async () => {
    await safetyModule.stake(1250);
    await expectPowerRelativeBlock(ctx.users[0], -1, 0);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1250);
  });

  it('Governance power can be delegated', async () => {
    await safetyModule.stake(1250);

    await safetyModule.delegateByType(ctx.users[1].address, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -1, 1250, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -1, 0, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 1250, DelegationType.PROPOSITION_POWER);

    await expectPowerRelativeBlock(ctx.users[0], -1, 1250, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1250, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -1, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 0, DelegationType.VOTING_POWER);

    await safetyModule.delegateByType(ctx.users[1].address, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -1, 1250, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -1, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 1250, DelegationType.VOTING_POWER);
  });

  it('Governance power can be transfered', async () => {
    await safetyModule.stake(1250); // [1250, 0]
    await safetyModule.transfer(ctx.users[1].address, 100); // [1150, 100]
    await safetyModule.transfer(ctx.users[1].address, 200); // [950, 300]
    await safetyModule.transfer(ctx.users[1].address, 400); // [550, 700]
    await safetyModule.connect(ctx.users[1]).transfer(ctx.users[0].address, 250); // [800, 450]
    await safetyModule.transfer(ctx.users[1].address, 800); // [0, 1250]
    await safetyModule.connect(ctx.users[1]).transfer(ctx.users[0].address, 625); // [625, 625]

    await expectPowerRelativeBlock(ctx.users[0], -7, 0);
    await expectPowerRelativeBlock(ctx.users[1], -7, 0);

    await expectPowerRelativeBlock(ctx.users[0], -6, 1250);
    await expectPowerRelativeBlock(ctx.users[1], -6, 0);

    await expectPowerRelativeBlock(ctx.users[0], -5, 1150);
    await expectPowerRelativeBlock(ctx.users[1], -5, 100);

    await expectPowerRelativeBlock(ctx.users[0], -4, 950);
    await expectPowerRelativeBlock(ctx.users[1], -4, 300);

    await expectPowerRelativeBlock(ctx.users[0], -3, 550);
    await expectPowerRelativeBlock(ctx.users[1], -3, 700);

    await expectPowerRelativeBlock(ctx.users[0], -2, 800);
    await expectPowerRelativeBlock(ctx.users[1], -2, 450);

    await expectPowerRelativeBlock(ctx.users[0], -1, 0);
    await expectPowerRelativeBlock(ctx.users[1], -1, 1250);

    await expectPowerRelativeBlock(ctx.users[0], 0, 625);
    await expectPowerRelativeBlock(ctx.users[1], 0, 625);
  });

  it('Governance power is affected by slashing', async () => {
    await safetyModule.stake(1250); // [1250, 0]
    await ctx.safetyModule.slash(250, ctx.deployer.address);

    await expectPowerRelativeBlock(ctx.users[0], -1, 1250);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);

    // Skip some blocks.
    for (let i = 0; i < 10; i++) {
      await advanceBlock();
    }

    await expectPowerRelativeBlock(ctx.users[0], -11, 1250);
    await expectPowerRelativeBlock(ctx.users[0], -10, 1000);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);

    // Transfer one fifth of the staked position.
    await safetyModule.transfer(ctx.users[1].address, 250); // [1000, 250]
    await expectPowerRelativeBlock(ctx.users[0], -1, 1000);
    await expectPowerRelativeBlock(ctx.users[1], -1, 0);
    await expectPowerRelativeBlock(ctx.users[0], 0, 800);
    await expectPowerRelativeBlock(ctx.users[1], 0, 200);

    // Delegate the rest of the position, for voting power only.
    await safetyModule.delegateByType(ctx.users[1].address, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -2, 1000);
    await expectPowerRelativeBlock(ctx.users[1], -2, 0);
    await expectPowerRelativeBlock(ctx.users[0], -1, 800);
    await expectPowerRelativeBlock(ctx.users[1], -1, 200);
    await expectPowerRelativeBlock(ctx.users[0], 0, 800, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 200, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 1000, DelegationType.VOTING_POWER);

    // Stake some more.
    await safetyModule.stake(1000); // [2250, 250]
    await expectPowerRelativeBlock(ctx.users[0], -1, 800, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -1, 200, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -1, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -1, 1000, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1800, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 200, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 2000, DelegationType.VOTING_POWER);

    // Skip some blocks.
    for (let i = 0; i < 7; i++) {
      await advanceBlock();
    }

    // Slash again, by 40%.
    await ctx.safetyModule.slash(800, ctx.deployer.address);
    await expectPowerRelativeBlock(ctx.users[0], -9, 800, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -9, 200, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -9, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -9, 1000, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -8, 1800, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -8, 200, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -8, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -8, 2000, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -7, 1800, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -7, 200, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], -7, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], -7, 2000, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1080, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 120, DelegationType.PROPOSITION_POWER);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0, DelegationType.VOTING_POWER);
    await expectPowerRelativeBlock(ctx.users[1], 0, 1200, DelegationType.VOTING_POWER);
  });

  it('Governance power is not affected by withdrawal requests', async () => {
    await safetyModule.stake(1250); // [1250, 0]
    await ctx.safetyModule.slash(250, ctx.deployer.address);

    await safetyModule.requestWithdrawal(1250);
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);

    // Elapse epochs...
    await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);
    await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);
    await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);
  });

  it('Governance power is affected by withdrawals', async () => {
    await safetyModule.stake(1250); // [1250, 0]
    await ctx.safetyModule.slash(250, ctx.deployer.address);
    await safetyModule.requestWithdrawal(1250);
    await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
    await expectPowerRelativeBlock(ctx.users[0], 0, 1000);

    await safetyModule.withdrawStake(ctx.users[0].address, 125);
    await expectPowerRelativeBlock(ctx.users[0], 0, 900);
    await safetyModule.withdrawStake(ctx.users[0].address, 125);
    await expectPowerRelativeBlock(ctx.users[0], 0, 800);
    await safetyModule.withdrawStake(ctx.users[0].address, 250);
    await expectPowerRelativeBlock(ctx.users[0], 0, 600);

    // Slash again, by 50%.
    await ctx.safetyModule.slash(300, ctx.deployer.address);
    await expectPowerRelativeBlock(ctx.users[0], 0, 300);

    // Withdraw the remaining stake.
    await safetyModule.withdrawStake(ctx.users[0].address, 750);
    await expectPowerRelativeBlock(ctx.users[0], 0, 0);
    await expectPowerRelativeBlock(ctx.users[0], -1, 300);
    await expectPowerRelativeBlock(ctx.users[0], -2, 600);
    await expectPowerRelativeBlock(ctx.users[0], -3, 800);
    await expectPowerRelativeBlock(ctx.users[0], -4, 900);
    await expectPowerRelativeBlock(ctx.users[0], -5, 1000);
  });

  async function expectPowerRelativeBlock(
    user: SignerWithAddress,
    relativeBlockNumber: number,
    amount: number,
    optionalType: DelegationType | null = null,
  ): Promise<void> {
    return expectPowerAtBlock(
      user,
      await latestBlock() + relativeBlockNumber,
      amount,
      optionalType,
    );
  }

  async function expectPowerAtBlock(
    user: SignerWithAddress,
    blockNumber: number,
    amount: number,
    optionalType: DelegationType | null = null,
  ): Promise<void> {
    if (optionalType !== DelegationType.VOTING_POWER) {
      expect(await ctx.safetyModule.getPowerAtBlock(
        user.address,
        blockNumber,
        DelegationType.PROPOSITION_POWER,
      )).to.equal(amount);
    }
    if (optionalType !== DelegationType.PROPOSITION_POWER) {
      expect(await ctx.safetyModule.getPowerAtBlock(
        user.address,
        blockNumber,
        DelegationType.VOTING_POWER,
      )).to.equal(amount);
    }
  }
});
