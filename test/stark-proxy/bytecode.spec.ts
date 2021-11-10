import { verifyContract } from '../../src/lib/verify-contract-bytecode';
import { describeContract, TestContext } from '../helpers/describe-contract';

function init() {}

describeContract('StarkProxy contract bytecode', init, (ctx: TestContext) => {

  ctx.config.STARK_PROXY_CONFIG.BORROWER_CONFIGS.forEach((_, i: number) => {
    it(`The upgradeability proxy for stark proxy ${i} has the expected bytecode`, async () => {
      await verifyContract(
        'contracts/dependencies/open-zeppelin/',
        'InitializableAdminUpgradeabilityProxy',
        ctx.starkProxies[i].address,
        {},
      );
    });

    it(`The current implementation for stark proxy ${i} has the expected bytecode`, async () => {
      const currentImplementationAddress: string = await ctx.starkProxyProxyAdmins[i].getProxyImplementation(ctx.starkProxies[i].address);
      await verifyContract(
        'contracts/stark-proxy/v2/',
        'StarkProxyV2',
        currentImplementationAddress,
        {
          LIQUIDITY_STAKING: ctx.liquidityStaking.address,
          MERKLE_DISTRIBUTOR: ctx.merkleDistributor.address,
          STARK_PERPETUAL: ctx.starkPerpetual.address,
          TOKEN: ctx.dydxCollateralToken.address,
        },
      );
    });
  });
});
