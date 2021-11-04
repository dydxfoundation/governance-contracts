import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Signer } from 'ethers';

import { getRole } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { Role } from '../../src/types';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MintableERC20 } from '../../types/MintableErc20';
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { describeContractHardhat, TestContext } from '../helpers/describe-contract';
import { evmReset, evmSnapshot } from '../helpers/evm';
import { findAddressWithRole } from '../helpers/get-address-with-role';
import { StakingHelper } from '../helpers/staking-helper';

// Snapshots
const borrowerHasBorrowed = 'BorrowerHasBorrowed';
const borrowerRestrictedSnapshot = 'BorrowerRestrictedSnapshot';

const stakerInitialBalance: number = 1_000_000;

// Contracts.
let deployer: Signer;
let liquidityStaking: LiquidityStakingV1;
let mockStakedToken: MintableERC20;
let mockStarkPerpetual: MockStarkPerpetual;
let shortTimelockSigner: SignerWithAddress;

// Users.
let stakers: SignerWithAddress[];
let borrowerStarkProxies: StarkProxyV1[];

let contract: StakingHelper;

async function init(ctx: TestContext) {
  ({
    liquidityStaking,
    deployer,
  } = ctx);

  mockStakedToken = ctx.dydxCollateralToken;
  mockStarkPerpetual = ctx.starkPerpetual;

  // Users.
  stakers = ctx.users.slice(1, 3); // 2 stakers
  const borrowers = await Promise.all(ctx.starkProxies.map(async b => {
    const ownerAddress = await findAddressWithRole(b, Role.OWNER_ROLE);
    return impersonateAndFundAccount(ownerAddress);
  }));

  borrowerStarkProxies = borrowers.map((b: SignerWithAddress, i: number) => ctx.starkProxies[i].connect(b));

  // Grant roles.
  const deployerAddress: string = await deployer.getAddress();
  await Promise.all(borrowerStarkProxies.map(async b => {
    await b.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), deployerAddress);
    await b.grantRole(getRole(Role.BORROWER_ROLE), deployerAddress);
  }));

  shortTimelockSigner = await impersonateAndFundAccount(ctx.shortTimelock.address);

  await ctx.dydxCollateralToken.mint(ctx.deployer.address, stakerInitialBalance * stakers.length);

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx, 
    liquidityStaking,
    mockStakedToken,
    ctx.rewardsTreasury.address,
    ctx.deployer,
    shortTimelockSigner,
    stakers.concat(borrowers),
    false,
  );

  // Mint staked tokens and set allowances.
  await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));

  // Initial stake of 1M.
  await contract.stake(stakers[0], stakerInitialBalance / 4);
  await contract.stake(stakers[1], (stakerInitialBalance / 4) * 3);

  // Allocations: [40%, 60%], remaining borrowers 0%
  await contract.setBorrowerAllocations({
    [borrowerStarkProxies[0].address]: 0.4,
    [borrowerStarkProxies[1].address]: 0.6,
    [borrowerStarkProxies[2].address]: 0.0,
    [borrowerStarkProxies[3].address]: 0.0,
    [borrowerStarkProxies[4].address]: 0.0,
  });

  // Borrow full amount.
  await contract.elapseEpoch();
  await contract.fullBorrowViaProxy(borrowerStarkProxies[0], stakerInitialBalance * 0.4);
  expect(await mockStakedToken.balanceOf(borrowerStarkProxies[0].address)).to.equal(
    stakerInitialBalance * 0.4,
  );

  contract.saveSnapshot(borrowerHasBorrowed);
}

describeContractHardhat('SP2Exchange', init, () => {
  describe('interacting with the exchange', () => {
    const starkKey = 123;
    let postInitSnapshotId: string;

    before(async () => {
      postInitSnapshotId = await evmSnapshot();
    });

    beforeEach(async () => {
      contract.loadSnapshot(borrowerHasBorrowed);
      await evmReset(postInitSnapshotId);
      postInitSnapshotId = await evmSnapshot();
    });

    after(async () => {
      await evmReset(postInitSnapshotId);
    });

    it('can add a STARK key that is registered to the StarkProxy contract', async () => {
      await mockStarkPerpetual.registerUser(borrowerStarkProxies[0].address, starkKey, []);
      await borrowerStarkProxies[0].allowStarkKey(starkKey);
    });

    it('cannot add a STARK key that is not registered', async () => {
      await expect(borrowerStarkProxies[0].allowStarkKey(starkKey)).to.be.revertedWith(
        'USER_UNREGISTERED',
      );
    });

    it('cannot add a STARK key that is registered to another address', async () => {
      await mockStarkPerpetual.registerUser(borrowerStarkProxies[1].address, starkKey, []);
      await expect(borrowerStarkProxies[0].allowStarkKey(starkKey)).to.be.revertedWith(
        'SP2Owner: STARK key not registered to this contract',
      );
    });

    it('cannot deposit to a STARK key that has not been allowed', async () => {
      await mockStarkPerpetual.registerUser(borrowerStarkProxies[0].address, starkKey, []);
      await expect(borrowerStarkProxies[0].depositToExchange(starkKey, 0, 0, 0)).to.be.revertedWith(
        'SP1Storage: STARK key is not on the allowlist',
      );
    });

    it('cannot deposit to a STARK key that has been disallowed', async () => {
      await mockStarkPerpetual.registerUser(borrowerStarkProxies[0].address, starkKey, []);
      await borrowerStarkProxies[0].allowStarkKey(starkKey);
      await borrowerStarkProxies[0].disallowStarkKey(starkKey);
      await expect(borrowerStarkProxies[0].depositToExchange(starkKey, 0, 0, 0)).to.be.revertedWith(
        'SP1Storage: STARK key is not on the allowlist',
      );
    });

    it('can deposit and withdraw, and then repay', async () => {
      await mockStarkPerpetual.registerUser(borrowerStarkProxies[0].address, starkKey, []);
      await borrowerStarkProxies[0].allowStarkKey(starkKey);
      await borrowerStarkProxies[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.4);
      await borrowerStarkProxies[0].withdrawFromExchange(starkKey, 456);
      await contract.repayBorrowViaProxy(borrowerStarkProxies[0], stakerInitialBalance * 0.4);
    });
  });

  describe('after restricted by guardian', () => {
    const starkKey = 123;
    let guardianSnapshot: string;

    before(async () => {
      // Restrict borrowing.
      await expect(
        borrowerStarkProxies[0].connect(shortTimelockSigner).guardianSetBorrowingRestriction(true),
      )
        .to.emit(borrowerStarkProxies[0], 'BorrowingRestrictionChanged')
        .withArgs(true);

      // Register with the exchange.
      await mockStarkPerpetual.registerUser(borrowerStarkProxies[0].address, starkKey, []);

      contract.saveSnapshot(borrowerRestrictedSnapshot);
      guardianSnapshot = await evmSnapshot();
    });

    beforeEach(async () => {
      contract.loadSnapshot(borrowerRestrictedSnapshot);
      await evmReset(guardianSnapshot);
      guardianSnapshot = await evmSnapshot();
    });

    it('cannot deposit borrowed funds to the exchange', async () => {
      await borrowerStarkProxies[0].allowStarkKey(starkKey);
      await expect(
        borrowerStarkProxies[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.4),
      ).to.be.revertedWith(
        'SP2Exchange: Cannot deposit borrowed funds to the exchange while Restricted',
      );
    });

    it('can still deposit own funds to the exchange', async () => {
      await borrowerStarkProxies[0].allowStarkKey(starkKey);

      // Transfer some funds directly to the StarkProxy contract.
      const ownFundsAmount = 12340;
      await mockStakedToken
        .connect(stakers[0])
        .transfer(borrowerStarkProxies[0].address, ownFundsAmount);

      // Deposit own funds to the exchange.
      await borrowerStarkProxies[0].depositToExchange(starkKey, 456, 789, ownFundsAmount);

      // Cannot deposit any more.
      await expect(borrowerStarkProxies[0].depositToExchange(starkKey, 456, 789, 1)).to.be.revertedWith(
        'SP2Exchange: Cannot deposit borrowed funds to the exchange while Restricted',
      );
    });
  });
});
