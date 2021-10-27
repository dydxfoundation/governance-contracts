import { expect } from 'chai';
import { Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';

import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { IStarkPerpetual__factory } from '../../types/factories/IStarkPerpetual__factory';
import { StarkProxyV2__factory } from '../../types/factories/StarkProxyV2__factory';
import { TestContext, describeContract } from '../helpers/describe-contract';
import { increaseTimeAndMine } from '../helpers/evm';

function init() {}

describeContract('SP1Owner', init, (ctx: TestContext) => {

  it('Can cancel current deposit and reclaim funds', async () => {
    const mockWintermute: Signer = await impersonateAndFundAccount('0x4f3a120E72C76c22ae802D129F599BFDbc31cb81');

    const starkProxy = new StarkProxyV2__factory(mockWintermute).attach('0x0b2B08AC98a1568A34208121c26F4F41a9e0FbB6');
    const starkPerpetualAddress = await starkProxy.STARK_PERPETUAL();
    const starkProxyBalanceBefore = await starkProxy.getTokenBalance();

    const depositEvents = await starkProxy.queryFilter(
      starkProxy.filters.DepositedToExchange(null, null, null, null),
    );

    const badVaultId = '32';
    const faultyDeposits = depositEvents.filter((e) => e.args.starkVaultId.toString() === badVaultId);

    expect(faultyDeposits.length).to.equal(1);

    const starkKey = faultyDeposits[0].args.starkKey;
    const assetType = faultyDeposits[0].args.starkAssetType;

    await starkProxy.depositCancel(starkKey, assetType, badVaultId);

    const twoDaysSeconds = 2 * 24 * 60 * 60;
    await increaseTimeAndMine(twoDaysSeconds);

    await starkProxy.depositReclaim(starkKey, assetType, badVaultId);

    const starkProxyBalanceAfter = await starkProxy.getTokenBalance();

    console.log('Before:', starkProxyBalanceBefore.toString(), 'after:', starkProxyBalanceAfter.toString());
    const diff = starkProxyBalanceAfter.sub(starkProxyBalanceBefore).toString();
    expect(diff).to.equal(parseUnits('50000000', 6));
  });
});
