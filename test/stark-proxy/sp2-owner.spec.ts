import { expect } from 'chai';
import { Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';

import { ONE_DAY_SECONDS } from '../../src/lib/constants';
import { getRole } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { NetworkName, Role } from '../../src/types';
import { IFreezableStarkPerpetual__factory } from '../../types';
import { StarkProxyV2__factory } from '../../types/factories/StarkProxyV2__factory';
import { IFreezableStarkPerpetual } from '../../types/IFreezableStarkPerpetual';
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { StarkProxyV2 } from '../../types/StarkProxyV2';
import { TestContext, describeContract, describeContractForNetwork } from '../helpers/describe-contract';
import { increaseTimeAndMine, incrementTimeToTimestamp, latestBlockTimestamp } from '../helpers/evm';
import { findAddressWithRole } from '../helpers/get-address-with-role';

let mockStarkPerpetual: MockStarkPerpetual;
let borrowerStarkProxy: StarkProxyV2;

async function init(ctx: TestContext): Promise<void> {
  mockStarkPerpetual = ctx.starkPerpetual;

  const ownerAddress = await findAddressWithRole(ctx.starkProxies[0], Role.OWNER_ROLE);
  const borrower = await impersonateAndFundAccount(ownerAddress);

  borrowerStarkProxy = new StarkProxyV2__factory(borrower).attach(ctx.starkProxies[0].address);
}

describeContract('SP2Owner', init, (ctx: TestContext) => {

  describeContractForNetwork(
    'SP2Owner Hardhat Tests',
    ctx,
    NetworkName.hardhat,
    false,
    () => {
      it('OWNER_ROLE can cancel and reclaim a deposit', async () => {
        // Register STARK key and add it to the allowlist.
        const mockStarkKey = 0;
        const mockAssetType = 1;
        const mockVaultId = 2;
        await mockStarkPerpetual.registerUser(borrowerStarkProxy.address, mockStarkKey, []);
        await borrowerStarkProxy.allowStarkKey(mockStarkKey);

        await expect(borrowerStarkProxy.depositCancel(mockStarkKey, mockAssetType, mockVaultId))
          .to.emit(borrowerStarkProxy, 'DepositCanceled')
          .withArgs(mockStarkKey, mockVaultId, false);

        await expect(borrowerStarkProxy.depositReclaim(mockStarkKey, mockAssetType, mockVaultId))
          .to.emit(borrowerStarkProxy, 'DepositReclaimed')
          .withArgs(mockStarkKey, mockVaultId, false);
      });

      it('User without OWNER_ROLE cannot cancel or reclaim a deposit', async () => {
        // Register STARK key and add it to the allowlist.
        const mockStarkKey = 0;
        const mockAssetType = 1;
        const mockVaultId = 2;
        await mockStarkPerpetual.registerUser(borrowerStarkProxy.address, mockStarkKey, []);
        await borrowerStarkProxy.allowStarkKey(mockStarkKey);

        const starkProxy = borrowerStarkProxy.connect(ctx.users[0]);
        const userAddress: string = ctx.users[0].address.toLowerCase();
        const accessControlError = `AccessControl: account ${userAddress} is missing role ${getRole(Role.OWNER_ROLE)}`;
        await expect(starkProxy.depositCancel(mockStarkKey, mockAssetType, mockVaultId))
          .to.be.revertedWith(accessControlError);

        await expect(starkProxy.depositReclaim(mockStarkKey, mockAssetType, mockVaultId))
          .to.be.revertedWith(accessControlError);
      });
    });

  describeContractForNetwork(
    'SP2Owner Hardhat Tests',
    ctx,
    NetworkName.hardhat,
    true,
    () => {
      it('OWNER_ROLE can cancel faulty deposit and reclaim funds', async () => {
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

      it('OWNER_ROLE can force withdraw funds from the exchange', async () => {
        const wintermuteStarkProxy: StarkProxyV1 = ctx.starkProxies[0];
        const ownerAddress: string = await findAddressWithRole(wintermuteStarkProxy, Role.OWNER_ROLE);
        const owner: Signer = await impersonateAndFundAccount(ownerAddress);

        const starkProxy: StarkProxyV2 = new StarkProxyV2__factory(owner).attach(wintermuteStarkProxy.address);

        const depositEvents = await starkProxy.queryFilter(
          starkProxy.filters.DepositedToExchange(null, null, null, null),
        );

        const wintermuteVaultId = '50';
        const deposits = depositEvents.filter((e) => e.args.starkVaultId.toString() === wintermuteVaultId);

        expect(deposits.length).to.be.be.gte(1);

        const starkKey = deposits[0].args.starkKey;
        const quantizedAmount = '1';

        await expect(starkProxy.forcedWithdrawalRequest(starkKey, wintermuteVaultId, quantizedAmount, false))
          .to.emit(starkProxy, 'RequestedForcedWithdrawal')
          .withArgs(starkKey, wintermuteVaultId, false);

        const currentBlockTime: number = await latestBlockTimestamp();
        await incrementTimeToTimestamp((ONE_DAY_SECONDS * 14) + currentBlockTime);
        
        const starkPerpetual: IFreezableStarkPerpetual = IFreezableStarkPerpetual__factory.connect(
          ctx.starkPerpetual.address,
          ctx.deployer,
        );

        await expect(starkPerpetual.freezeRequest(starkKey, wintermuteVaultId, quantizedAmount))
          .to.emit(starkPerpetual, 'LogFrozen');
      });
    });
});
