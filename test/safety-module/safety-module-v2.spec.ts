import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { SM_ROLE_HASHES } from '../../src/lib/constants';
import { getRole } from '../../src/lib/util';
import { deployUpgradeable } from '../../src/migrations/helpers/deploy-upgradeable';
import { Role } from '../../src/types';
import { SafetyModuleV1__factory } from '../../types';
import { TestContext, describeContract } from '../helpers/describe-contract';
import { latestBlockTimestamp } from '../helpers/evm';
import hre from '../hre';

let staker: SignerWithAddress;

function init(ctx: TestContext) {
  [staker] = ctx.users;
}

describeContract('SafetyModuleV2 initialization', init, (ctx: TestContext) => {

  it('Staked token is set during initialization', async () => {
    expect(await ctx.safetyModule.STAKED_TOKEN()).to.equal(ctx.dydxToken.address);
  });

  it('Rewards token is set during initialization', async () => {
    expect(await ctx.safetyModule.REWARDS_TOKEN()).to.equal(ctx.dydxToken.address);
  });

  it('Short timelock has all roles except the operator roles', async () => {
    const roleHashes = [
      Role.OWNER_ROLE,
      Role.SLASHER_ROLE,
      Role.EPOCH_PARAMETERS_ROLE,
      Role.REWARDS_RATE_ROLE,
    ].map(getRole);
    for (const role of roleHashes) {
      expect(await ctx.safetyModule.hasRole(role, ctx.shortTimelock.address)).to.be.true();
    }
  });

  it('All roles are admined by the OWNER_ROLE', async () => {
    for (const role of SM_ROLE_HASHES) {
      expect(await ctx.safetyModule.getRoleAdmin(role)).to.equal(getRole(Role.OWNER_ROLE));
    }
  });

  it('Rewards vault is set during initialization', async () => {
    expect(await ctx.safetyModule.REWARDS_TREASURY()).to.equal(ctx.rewardsTreasury.address);
  });

  it('Blackout window is set during initialization', async () => {
    expect(await ctx.safetyModule.getBlackoutWindow()).to.equal(ctx.config.BLACKOUT_WINDOW);
  });

  it('Emissions per second is initially zero', async () => {
    expect(await ctx.safetyModule.getRewardsPerSecond()).to.equal(ctx.config.SM_REWARDS_PER_SECOND);
  });

  it('Epoch parameters are set during initialization', async () => {
    const epochParameters = await ctx.safetyModule.getEpochParameters();
    expect(epochParameters.interval).to.equal(ctx.config.EPOCH_LENGTH);
    expect(epochParameters.offset).to.equal(ctx.config.EPOCH_ZERO_START);
  });

  it('Domain separator is set during initialization', async () => {
    const domainSeparator = await ctx.safetyModule.getDomainSeparator();
    expect(BigNumber.from(domainSeparator).eq(0)).to.be.false();
  });

  it('Initializes the exchange rate to a value of one', async () => {
    console.log('SM address', ctx.safetyModule.address);
    const exchangeRateBase = await ctx.safetyModule.EXCHANGE_RATE_BASE();
    const exchangeRate = await ctx.safetyModule.getExchangeRate();
    expect(exchangeRate.eq(0)).to.be.false('Exchange rate was zero');
    expect(exchangeRate).to.equal(exchangeRateBase);
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
