import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import _ from 'lodash';

import { getRole, waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { NetworkName, Role } from '../../src/types';
import { StarkProxyV2__factory } from '../../types/factories/StarkProxyV2__factory';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
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
let mockStarkPerpetual: MockStarkPerpetual;
let borrowerStarkProxies: StarkProxyV1[];
let borrowerStarkProxy: StarkProxyV1;

let forcedTradeWaitingPeriod: BigNumber;
let forcedTradeGracePeriod: BigNumber;

async function init(ctx: TestContext) {
  deployer = ctx.deployer;
  shortTimelockSigner = await impersonateAndFundAccount(ctx.shortTimelock.address);
  merkleTimelockSigner = await impersonateAndFundAccount(ctx.merklePauserTimelock.address);

  liquidityStaking = ctx.liquidityStaking;
  mockStarkPerpetual = ctx.starkPerpetual;
  const borrowers = await Promise.all(ctx.starkProxies.map(async b => {
    const ownerAddress = await findAddressWithRole(b, Role.OWNER_ROLE);
    return impersonateAndFundAccount(ownerAddress);
  }));
  borrowerStarkProxies = borrowers.map((b: SignerWithAddress, i: number) => ctx.starkProxies[i].connect(b));
  borrowerStarkProxy = borrowerStarkProxies[0];

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
        for (const borrower of borrowerStarkProxies) {
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
    });

  describeContractForNetwork(
    'Stark Proxy deposit cancel and reclaim',
    ctx,
    NetworkName.hardhat,
    true,
    () => {
      it('GUARDIAN_ROLE can cancel faulty deposit and reclaim funds', async () => {
        const wintermuteStarkProxy: StarkProxyV1 = ctx.starkProxies[0];

        const starkProxy: StarkProxyV2 = new StarkProxyV2__factory(shortTimelockSigner).attach(wintermuteStarkProxy.address);
        const starkProxyBalanceBefore = await starkProxy.getTokenBalance();

        const depositEvents = await starkProxy.queryFilter(
          starkProxy.filters.DepositedToExchange(null, null, null, null),
        );

        const badVaultId = '32';
        const faultyDeposits = depositEvents.filter((e) => e.args.starkVaultId.toString() === badVaultId);

        expect(faultyDeposits.length).to.equal(1);

        const starkKey = faultyDeposits[0].args.starkKey;
        const assetType = faultyDeposits[0].args.starkAssetType;

        await expect(starkProxy.guardianDepositCancel(starkKey, assetType, badVaultId))
          .to.emit(starkProxy, 'DepositCanceled')
          .withArgs(starkKey, badVaultId, true);

        const twoDaysSeconds = 2 * 24 * 60 * 60;
        await increaseTimeAndMine(twoDaysSeconds);

        await expect(starkProxy.guardianDepositReclaim(starkKey, assetType, badVaultId))
          .to.emit(starkProxy, 'DepositReclaimed')
          .withArgs(starkKey, badVaultId, true);

        const starkProxyBalanceAfter = await starkProxy.getTokenBalance();

        const diff = starkProxyBalanceAfter.sub(starkProxyBalanceBefore).toString();
        expect(diff).to.equal(parseUnits('50000000', 6));
      });
    });
});
