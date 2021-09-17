import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { deployUpgradeable } from '../../src/deployment/deploy-upgradeable';
import { SafetyModuleV1__factory } from '../../types';
import { TestContext, describeContract } from '../helpers/describe-contract';
import { latestBlockTimestamp } from '../helpers/evm';

let staker: SignerWithAddress;

function init(ctx: TestContext) {
  [staker] = ctx.users;
}

describeContract('SafetyModuleV1 initialization', init, (ctx: TestContext) => {

  it('Staked token is set during initialization', async () => {
    expect(await ctx.safetyModule.STAKED_TOKEN()).to.be.equal(ctx.dydxToken.address);
  });

  it('Rewards token is set during initialization', async () => {
    expect(await ctx.safetyModule.REWARDS_TOKEN()).to.be.equal(ctx.dydxToken.address);
  });

  it('Deployer has proper roles set during initialization and is admin of all roles', async () => {
    const roles: string[] = await Promise.all([
      ctx.safetyModule.OWNER_ROLE(),
      ctx.safetyModule.EPOCH_PARAMETERS_ROLE(),
      ctx.safetyModule.REWARDS_RATE_ROLE(),
    ]);

    // deployer should have all roles except claimOperator, stakeOperator, and debtOperator.
    for (const role of roles) {
      expect(await ctx.safetyModule.hasRole(role, ctx.deployer.address)).to.be.true();
    }

    const stakeOperatorRole: string = await ctx.safetyModule.STAKE_OPERATOR_ROLE();
    expect(await ctx.safetyModule.hasRole(stakeOperatorRole, ctx.deployer.address)).to.be.false();

    const ownerRole: string = roles[0];
    const allRoles: string[] = roles.concat(stakeOperatorRole);
    for (const role of allRoles) {
      expect(await ctx.safetyModule.getRoleAdmin(role)).to.equal(ownerRole);
    }
  });

  it('Rewards vault is set during initialization', async () => {
    expect(await ctx.safetyModule.REWARDS_TREASURY()).to.be.equal(ctx.rewardsTreasury.address);
  });

  it('Blackout window is set during initialization', async () => {
    expect(await ctx.safetyModule.getBlackoutWindow()).to.be.equal(ctx.config.BLACKOUT_WINDOW);
  });

  it('Emissions per second is initially zero', async () => {
    expect(await ctx.safetyModule.getRewardsPerSecond()).to.be.equal(ctx.config.SM_REWARDS_PER_SECOND);
  });

  it('Epoch parameters are set during initialization', async () => {
    const latestTimestamp = await latestBlockTimestamp();

    const epochParameters = await ctx.safetyModule.getEpochParameters();
    expect(epochParameters.interval).to.be.equal(ctx.config.EPOCH_LENGTH);
    // expect offset to be at least later than now (was initialized to 60 seconds after current blocktime)
    expect(epochParameters.offset).to.be.at.least(latestTimestamp);
  });

  it('Domain separator is set during initialization', async () => {
    const domainSeparator = await ctx.safetyModule.getDomainSeparator();
    expect(BigNumber.from(domainSeparator).eq(0)).to.be.false();
  });

  it('Initializes the exchange rate to a value of one', async () => {
    const exchangeRateBase = await ctx.safetyModule.EXCHANGE_RATE_BASE();
    const exchangeRate = await ctx.safetyModule.getExchangeRate();
    expect(exchangeRate).to.equal(exchangeRateBase);
    expect(exchangeRate.eq(0)).to.be.false();
  });

  it('Total active current balance is initially zero', async () => {
    expect(await ctx.safetyModule.getTotalActiveBalanceCurrentEpoch()).to.equal(0);
  });

  it('Total active next balance is initially zero', async () => {
    expect(await ctx.safetyModule.getTotalActiveBalanceNextEpoch()).to.equal(0);
  });

  it('Total inactive current balance is initially zero', async () => {
    expect(await ctx.safetyModule.getTotalInactiveBalanceCurrentEpoch()).to.equal(0);
  });

  it('Total inactive next balance is initially zero', async () => {
    expect(await ctx.safetyModule.getTotalInactiveBalanceNextEpoch()).to.equal(0);
  });

  it('User active current balance is initially zero', async () => {
    expect(await ctx.safetyModule.getActiveBalanceCurrentEpoch(staker.address)).to.equal(0);
  });

  it('User active next balance is initially zero', async () => {
    expect(await ctx.safetyModule.getActiveBalanceNextEpoch(staker.address)).to.equal(0);
  });

  it('User inactive current balance is initially zero', async () => {
    expect(await ctx.safetyModule.getInactiveBalanceCurrentEpoch(staker.address)).to.equal(0);
  });

  it('User inactive next balance is initially zero', async () => {
    expect(await ctx.safetyModule.getInactiveBalanceNextEpoch(staker.address)).to.equal(0);
  });

  it('Cannot initialize with epoch zero in the past', async () => {
    const pastTimestamp = await latestBlockTimestamp() - 1;
    // Note: Since this reverts within InitializableUpgradeabilityProxy, there is no reason string.
    await expect(
      deployUpgradeable(
        SafetyModuleV1__factory,
        ctx.deployer,
        [
          ctx.dydxToken.address,
          ctx.dydxToken.address,
          ctx.rewardsTreasury.address,
          ctx.config.SM_DISTRIBUTION_START,
          ctx.config.SM_DISTRIBUTION_END,
        ],
        [
          ctx.config.EPOCH_LENGTH,
          pastTimestamp,
          ctx.config.BLACKOUT_WINDOW,
        ],
      ),
    ).to.be.reverted();
  });
});
