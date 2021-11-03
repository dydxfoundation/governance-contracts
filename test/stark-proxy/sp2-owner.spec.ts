import { expect } from 'chai';
import { Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';

import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { Role } from '../../src/types';
import { StarkProxyV2__factory } from '../../types/factories/StarkProxyV2__factory';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { StarkProxyV2 } from '../../types/StarkProxyV2';
import { TestContext, describeContract, mainnetForkTest } from '../helpers/describe-contract';
import { increaseTimeAndMine } from '../helpers/evm';
import { findAddressWithRole } from '../helpers/get-address-with-role';

function init(): void { }

describeContract('SP2Owner', init, (ctx: TestContext) => {

  mainnetForkTest('OWNER_ROLE can cancel faulty deposit and reclaim funds', async () => {
    const wintermuteStarkProxy: StarkProxyV1 = ctx.starkProxies[0];
    const ownerAddress: string = await findAddressWithRole(wintermuteStarkProxy, Role.OWNER_ROLE);
    const owner: Signer = await impersonateAndFundAccount(ownerAddress);

    const starkProxy: StarkProxyV2 = new StarkProxyV2__factory(owner).attach(wintermuteStarkProxy.address);
    const starkProxyBalanceBefore = await starkProxy.getTokenBalance();

    const depositEvents = await starkProxy.queryFilter(
      starkProxy.filters.DepositedToExchange(null, null, null, null),
    );

    const badVaultId = '32';
    const faultyDeposits = depositEvents.filter((e) => e.args.starkVaultId.toString() === badVaultId);

    expect(faultyDeposits.length).to.equal(1);

    const starkKey = faultyDeposits[0].args.starkKey;
    const assetType = faultyDeposits[0].args.starkAssetType;

    await expect(starkProxy.depositCancel(starkKey, assetType, badVaultId))
      .to.emit(starkProxy, 'DepositCanceled')
      .withArgs(starkKey, badVaultId, false);

    const twoDaysSeconds = 2 * 24 * 60 * 60;
    await increaseTimeAndMine(twoDaysSeconds);

    await expect(starkProxy.depositReclaim(starkKey, assetType, badVaultId))
      .to.emit(starkProxy, 'DepositReclaimed')
      .withArgs(starkKey, badVaultId, false);

    const starkProxyBalanceAfter = await starkProxy.getTokenBalance();

    const diff = starkProxyBalanceAfter.sub(starkProxyBalanceBefore).toString();
    expect(diff).to.equal(parseUnits('50000000', 6));
  });
});
