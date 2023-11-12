import { COMMUNITY_TREASURY_VESTER_BURN_ADDRESS, REWARDS_TREASURY_VESTER_BURN_ADDRESS } from '../../src/lib/constants';
import { verifyContract } from '../../src/lib/verify-contract-bytecode';
import { describeContract, TestContext } from '../helpers/describe-contract';

function init() {}

describeContract('TreasuryBridge contract bytecode', init, (ctx: TestContext) => {

  it('The rewards treasury bridge contract has the expected bytecode', async () => {
    await verifyContract(
      'contracts/treasury/',
      'TreasuryBridge',
      ctx.rewardsTreasuryBridge.address,
      {
        TREASURY_VESTER: ctx.rewardsTreasuryVester.address,
        BRIDGE: ctx.wrappedDydxToken.address,
        BURN_ADDRESS: REWARDS_TREASURY_VESTER_BURN_ADDRESS,
      },
    );
  });

  it('The community treasury bridge contract has the expected bytecode', async () => {
    await verifyContract(
      'contracts/treasury/',
      'TreasuryBridge',
      ctx.communityTreasuryBridge.address,
      {
        TREASURY_VESTER: ctx.communityTreasuryVester.address,
        BRIDGE: ctx.wrappedDydxToken.address,
        BURN_ADDRESS: COMMUNITY_TREASURY_VESTER_BURN_ADDRESS,
      },
    );
  });
});
