import { verifyContract } from '../../src/lib/verify-contract-bytecode';
import { describeContract, TestContext } from '../helpers/describe-contract';

function init() {}

describeContract('SafetyModule contract bytecode', init, (ctx: TestContext) => {

  it('The upgradeability proxy has the expected bytecode', async () => {
    await verifyContract(
      'contracts/dependencies/open-zeppelin/',
      'InitializableAdminUpgradeabilityProxy',
      ctx.safetyModule.address,
      {},
    );
  });

  it('The implementation has the expected bytecode', async () => {

    await verifyContract(
      'contracts/safety/v2/',
      'SafetyModuleV2',
      ctx.safetyModuleNewImpl.address,
      {
        DISTRIBUTION_START: ctx.config.SM_RECOVERY_DISTRIBUTION_START,
        DISTRIBUTION_END: ctx.config.SM_RECOVERY_DISTRIBUTION_END,
        STAKED_TOKEN: ctx.dydxToken.address,
        REWARDS_TOKEN: ctx.dydxToken.address,
        REWARDS_TREASURY: ctx.rewardsTreasury.address,
      },
    );
  });
});
