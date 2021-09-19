import { expect } from 'chai';

import { deployUpgradeable } from '../../src/migrations/helpers/deploy-upgradeable';
import { SafetyModuleV11__factory } from '../../types';
import { TestContext, describeContract } from '../helpers/describe-contract';
import { latestBlockTimestamp } from '../helpers/evm';

function init() {}

describeContract('SafetyModuleV1 initializer', init, (ctx: TestContext) => {

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
});
