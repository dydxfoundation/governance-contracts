import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import _ from 'lodash';

import { getRole, waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { NetworkName, Role } from '../../src/types';
import { StarkProxyV2__factory } from '../../types/factories/StarkProxyV2__factory';
import { IStarkPerpetual } from '../../types/IStarkPerpetual';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { StarkProxyV2 } from '../../types/StarkProxyV2';
import { TestContext, describeContract, describeContractForNetwork } from '../helpers/describe-contract';
import { increaseTimeAndMine, incrementTimeToTimestamp, latestBlockTimestamp } from '../helpers/evm';
import { findAddressWithRole } from '../helpers/get-address-with-role';


type ForcedTradeArgs = [
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
];

let deployer: SignerWithAddress;
let shortTimelockSigner: SignerWithAddress;
let merkleTimelockSigner: SignerWithAddress;

// Each borrower is represented by a stark proxy contract.
let liquidityStaking: LiquidityStakingV1;
let mockStarkPerpetual: IStarkPerpetual;
let borrowerStarkProxy: StarkProxyV2;

let forcedTradeWaitingPeriod: BigNumber;
let forcedTradeGracePeriod: BigNumber;

async function init(ctx: TestContext): Promise<void> {
  deployer = ctx.deployer;
  shortTimelockSigner = await impersonateAndFundAccount(ctx.shortTimelock.address);
  merkleTimelockSigner = await impersonateAndFundAccount(ctx.merklePauserTimelock.address);

  liquidityStaking = ctx.liquidityStaking;
  mockStarkPerpetual = ctx.starkPerpetual;

  const ownerAddress = await findAddressWithRole(ctx.starkProxies[0], Role.OWNER_ROLE);
  const borrower = await impersonateAndFundAccount(ownerAddress);

  borrowerStarkProxy = new StarkProxyV2__factory(borrower).attach(ctx.starkProxies[0].address);

  // Grant exchange operator role.
  await borrowerStarkProxy.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), deployer.address);

  forcedTradeWaitingPeriod = await borrowerStarkProxy.FORCED_TRADE_WAITING_PERIOD();
  forcedTradeGracePeriod = await borrowerStarkProxy.FORCED_TRADE_GRACE_PERIOD();
}

describeContract('SP2Guardian', init, (ctx: TestContext) => {

  describeContractForNetwork(
    'SP2Guardian Hardhat Tests',
    ctx,
    NetworkName.hardhat,
    false,
    () => {
      it('No borrowers are initially in default', async () => {
        for (const borrower of ctx.starkProxies) {
          expect(await liquidityStaking.isBorrowerOverdue(borrower.address)).to.equal(false);
        }
      });

      it('Can veto a forced trade request', async () => {
        // Register STARK key and add it to the allowlist.
        const mockStarkKey = 0;
        await mockStarkPerpetual.registerUser(borrowerStarkProxy.address, mockStarkKey, []);
        await borrowerStarkProxy.allowStarkKey(mockStarkKey);

        // Owner enqueues a forced trade request.
        const args = _.range(12) as ForcedTradeArgs;
        const signature = Buffer.from('mock-signature');
        const tx = await borrowerStarkProxy.queueForcedTradeRequest(args);
        const receipt = await waitForTx(tx);
        const { argsHash } = borrowerStarkProxy.interface.parseLog(receipt.logs[0]).args;

        // Expect to fail during waiting period.
        await expect(borrowerStarkProxy.forcedTradeRequest(args, signature)).to.be.revertedWith(
          'SP2Owner: Waiting period has not elapsed for forced trade',
        );

        // Allow waiting period to elapse.
        let timestamp = await latestBlockTimestamp();

        await incrementTimeToTimestamp(forcedTradeWaitingPeriod.add(timestamp).toString());

        // Note: 'function selector was not recognized' means it has attempted to call through to the
        // mock StarkPerpetual contract, and did not revert on StarkProxy.
        await expect(borrowerStarkProxy.forcedTradeRequest(args, signature)).to.be.revertedWith(
          'function selector was not recognized',
        );

        // Expect to fail after waiting period, if vetoed.
        await borrowerStarkProxy.connect(merkleTimelockSigner).guardianVetoForcedTradeRequests([argsHash]);
        await expect(borrowerStarkProxy.forcedTradeRequest(args, signature)).to.be.revertedWith(
          'SP2Owner: Forced trade not queued or was vetoed',
        );

        // Queue it again and expect it to fail if outside of the grace period.
        await borrowerStarkProxy.queueForcedTradeRequest(args);
        timestamp = await latestBlockTimestamp();
        await incrementTimeToTimestamp(
          forcedTradeWaitingPeriod
            .add(forcedTradeGracePeriod)
            .add(timestamp)
            .add(1)
            .toString(),
        );
        await expect(borrowerStarkProxy.forcedTradeRequest(args, signature)).to.be.revertedWith(
          'SP2Owner: Grace period has elapsed for forced trade',
        );
      });

      it('GUARDIAN_ROLE can cancel and reclaim a deposit', async () => {
        // Register STARK key and add it to the allowlist.
        const mockStarkKey = 0;
        const mockAssetType = 1;
        const mockVaultId = 2;
        await mockStarkPerpetual.registerUser(borrowerStarkProxy.address, mockStarkKey, []);
        await borrowerStarkProxy.allowStarkKey(mockStarkKey);

        const guardianStarkProxy = borrowerStarkProxy.connect(shortTimelockSigner);
        await expect(guardianStarkProxy.guardianDepositCancel(mockStarkKey, mockAssetType, mockVaultId))
          .to.emit(guardianStarkProxy, 'DepositCanceled')
          .withArgs(mockStarkKey, mockAssetType, mockVaultId, true);

        await expect(guardianStarkProxy.guardianDepositReclaim(mockStarkKey, mockAssetType, mockVaultId))
          .to.emit(guardianStarkProxy, 'DepositReclaimed')
          .withArgs(mockStarkKey, mockAssetType, mockVaultId, 0, true);
      });

      it('User without GUARDIAN_ROLE cannot cancel or reclaim a deposit', async () => {
        // Register STARK key and add it to the allowlist.
        const mockStarkKey = 0;
        const mockAssetType = 1;
        const mockVaultId = 2;
        await mockStarkPerpetual.registerUser(borrowerStarkProxy.address, mockStarkKey, []);
        await borrowerStarkProxy.allowStarkKey(mockStarkKey);

        const ownerAddress: string = (await borrowerStarkProxy.signer.getAddress()).toLowerCase();
        const accessControlError = `AccessControl: account ${ownerAddress} is missing role ${getRole(Role.GUARDIAN_ROLE)}`;
        await expect(borrowerStarkProxy.guardianDepositCancel(mockStarkKey, mockAssetType, mockVaultId))
          .to.be.revertedWith(accessControlError);

        await expect(borrowerStarkProxy.guardianDepositReclaim(mockStarkKey, mockAssetType, mockVaultId))
          .to.be.revertedWith(accessControlError);
      });
    });
});
