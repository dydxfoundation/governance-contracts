import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import { deployUpgradeable } from '../../src/migrations/helpers/deploy-upgradeable';
import { SafetyModuleV1, SafetyModuleV11__factory } from '../../types';
import { TestContext, describeContract } from '../helpers/describe-contract';
import { latestBlockTimestamp } from '../helpers/evm';

let staker: SignerWithAddress;
let safetyModuleBeforeEpochZero: SafetyModuleV1;

async function init(ctx: TestContext) {
  [staker] = ctx.users;
  const distributionStart2 = await latestBlockTimestamp() + 500;
  [safetyModuleBeforeEpochZero] = await deployUpgradeable(
    SafetyModuleV11__factory,
    ctx.deployer,
    [
      ctx.dydxToken.address,
      ctx.dydxToken.address,
      ctx.rewardsTreasury.address,
      distributionStart2,
      ctx.config.SM_DISTRIBUTION_END,
    ],
    [
      ctx.config.EPOCH_LENGTH,
      distributionStart2,
      ctx.config.BLACKOUT_WINDOW,
    ],
  );
}

describeContract('SafetyModuleV1 initializer', init, (ctx: TestContext) => {

  it('Cannot deploy with distribution end before the distribution start', async () => {
    const pastTimestamp = await latestBlockTimestamp() - 1;
    await expect(
      deployUpgradeable(
        SafetyModuleV11__factory,
        ctx.deployer,
        [
          ctx.dydxToken.address,
          ctx.dydxToken.address,
          ctx.rewardsTreasury.address,
          ctx.config.SM_DISTRIBUTION_START,
          ctx.config.SM_DISTRIBUTION_START - 1,
        ],
        [
          ctx.config.EPOCH_LENGTH,
          pastTimestamp,
          ctx.config.BLACKOUT_WINDOW,
        ],
      ),
    ).to.be.reverted();
  });

  it('Cannot initialize with epoch zero in the past', async () => {
    const pastTimestamp = await latestBlockTimestamp() - 1;
    // Note: Since this reverts within InitializableUpgradeabilityProxy, there is no reason string.
    await expect(
      deployUpgradeable(
        SafetyModuleV11__factory,
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

  describe('Before epoch zero has started', () => {

    it('Total active current balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getTotalActiveBalanceCurrentEpoch()).to.equal(0);
    });

    it('Total active next balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getTotalActiveBalanceNextEpoch()).to.equal(0);
    });

    it('Total inactive current balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getTotalInactiveBalanceCurrentEpoch()).to.equal(0);
    });

    it('Total inactive next balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getTotalInactiveBalanceNextEpoch()).to.equal(0);
    });

    it('User active current balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getActiveBalanceCurrentEpoch(staker.address)).to.equal(0);
    });

    it('User active next balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getActiveBalanceNextEpoch(staker.address)).to.equal(0);
    });

    it('User inactive current balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getInactiveBalanceCurrentEpoch(staker.address)).to.equal(0);
    });

    it('User inactive next balance is zero', async () => {
      expect(await safetyModuleBeforeEpochZero.getInactiveBalanceNextEpoch(staker.address)).to.equal(0);
    });
  });
});
