import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { ZERO_ADDRESS } from '../../src/lib/constants';
import { getRole } from '../../src/lib/util';
import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { Role } from '../../src/types';
import { MockRewardsOracle__factory } from '../../types';
import { DydxToken } from '../../types/DydxToken';
import { IERC20 } from '../../types/IERC20';
import { IStarkPerpetual } from '../../types/IStarkPerpetual';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MerkleDistributorV1 } from '../../types/MerkleDistributorV1';
import { MockRewardsOracle } from '../../types/MockRewardsOracle';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { describeContractHardhatRevertBefore, TestContext } from '../helpers/describe-contract';
import { incrementTimeToTimestamp, latestBlockTimestamp, loadSnapshot, saveSnapshot } from '../helpers/evm';
import { findAddressWithRole } from '../helpers/get-address-with-role';
import { StakingHelper } from '../helpers/staking-helper';

// Snapshots
const snapshots = new Map<string, string>();
const fundsStakedSnapshot = 'FundsStaked';
const borrowerHasBorrowed = 'BorrowerHasBorrowed';

const stakerInitialBalance: number = 1_000_000;

// Contracts.
let deployer: SignerWithAddress;
let liquidityStaking: LiquidityStakingV1;
let mockStakedToken: IERC20;
let mockStarkPerpetual: IStarkPerpetual;

// Users.
let staker: SignerWithAddress;
let exchangeOperator: SignerWithAddress;
let withdrawalOperator: SignerWithAddress;
let shortTimelockSigner: SignerWithAddress;
let borrower: StarkProxyV1;
let asExchangeOperator: StarkProxyV1;
let asWithdrawalOperator: StarkProxyV1;

let contract: StakingHelper;

async function init(ctx: TestContext) {
  ({
    liquidityStaking,
    deployer,
  } = ctx);

  mockStakedToken = ctx.dydxCollateralToken;
  mockStarkPerpetual = ctx.starkPerpetual;

  // Users.
  [staker, exchangeOperator, withdrawalOperator] = ctx.users;
  [borrower] = ctx.starkProxies;

  const ownerAddress = await findAddressWithRole(borrower, Role.OWNER_ROLE);
  const ownerSigner = await impersonateAndFundAccount(ownerAddress);
  borrower = borrower.connect(ownerSigner);

  // Grant roles.
  await borrower.grantRole(getRole(Role.BORROWER_ROLE), deployer.address);
  await borrower.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), deployer.address);
  await borrower.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), exchangeOperator.address);
  await borrower.grantRole(getRole(Role.WITHDRAWAL_OPERATOR_ROLE), withdrawalOperator.address);
  asExchangeOperator = borrower.connect(exchangeOperator);
  asWithdrawalOperator = borrower.connect(withdrawalOperator);

  shortTimelockSigner = await impersonateAndFundAccount(ctx.shortTimelock.address);

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx,
    liquidityStaking,
    mockStakedToken,
    ctx.rewardsTreasury.address,
    deployer,
    shortTimelockSigner,
    [staker, withdrawalOperator, exchangeOperator],
    false,
  );

  // Mint staked tokens and set allowances.
  await contract.mintAndApprove(staker, stakerInitialBalance);

  // Initial stake of 1M.
  await contract.stake(staker, stakerInitialBalance);
  await saveSnapshot(snapshots, fundsStakedSnapshot, contract);
}

describeContractHardhatRevertBefore('SP2Withdrawals', init, (ctx: TestContext) => {
  describe('Borrower, after borrowing funds', () => {

    before(async () => {
      await loadSnapshot(snapshots, fundsStakedSnapshot, contract);

      // Allocations: 40% for first borrower, 0% for rest
      await contract.setBorrowerAllocations({
        [borrower.address]: 0.4,
        [ctx.starkProxies[1].address]: 0.0,
        [ctx.starkProxies[2].address]: 0.0,
        [ctx.starkProxies[3].address]: 0.0,
        [ctx.starkProxies[4].address]: 0.0,
        [ZERO_ADDRESS]: 0.6,
      });

      // Borrow full amount.
      await contract.elapseEpoch();
      await contract.fullBorrowViaProxy(borrower, stakerInitialBalance * 0.4);
      expect(await mockStakedToken.balanceOf(borrower.address)).to.equal(
        stakerInitialBalance * 0.4,
      );

      await saveSnapshot(snapshots, borrowerHasBorrowed, contract);
    });

    it('Can use non-borrowed funds on the exchange, and withdrawal operator can withdraw those funds', async () => {
      const borrowedAmount = stakerInitialBalance * 0.4;
      const [starkKey, assetType, vaultId] = [123, 456, 789];
      await mockStarkPerpetual.registerUser(borrower.address, starkKey, []);
      await borrower.allowStarkKey(starkKey);

      // Deposit borrowed funds to the exchange.
      await asExchangeOperator.depositToExchange(starkKey, assetType, vaultId, borrowedAmount);

      // Deposit own, un-borrowed funds to the exchange.
      const ownFundsAmount = 1_200_000;
      await mockStakedToken.transfer(borrower.address, ownFundsAmount);
      await asExchangeOperator.depositToExchange(starkKey, assetType, vaultId, ownFundsAmount);

      // Expect contract to have no funds
      expect(await mockStakedToken.balanceOf(borrower.address)).to.equal(0);

      // Withdraw from the exchange.
      await asExchangeOperator.withdrawFromExchange(starkKey, assetType);

      // Non withdrawal operator cannot withdraw from the proxy.
      await expect(asExchangeOperator.externalWithdrawToken(exchangeOperator.address, 1))
        .to.be.revertedWith('AccessControl');

      // Cannot withdraw if recipient not on the allowlist.
      await expect(asWithdrawalOperator.externalWithdrawToken(withdrawalOperator.address, ownFundsAmount))
        .to.be.revertedWith('SP1Storage: Recipient is not on the allowlist');

      // Cannot withdraw if contract would end up without enough funds to cover the borrowed balance.
      await borrower.allowExternalRecipient(withdrawalOperator.address);
      await expect(asWithdrawalOperator.externalWithdrawToken(withdrawalOperator.address, ownFundsAmount + 1))
        .to.be.revertedWith('SP2Withdrawals: Amount exceeds withdrawable balance');

      // Can withdraw if enough funds are left to cover the borrowed balance.
      await asWithdrawalOperator.externalWithdrawToken(withdrawalOperator.address, ownFundsAmount);

      // Expected borrower to have all their funds back.
      expect(await mockStakedToken.balanceOf(withdrawalOperator.address)).to.equal(ownFundsAmount);

      // Return borrowed funds.
      await contract.repayBorrowViaProxy(borrower, borrowedAmount);
      expect(await borrower.getBorrowedBalance()).to.equal(0);
    });
  });

  describe('claimRewardsFromMerkleDistributor', () => {
    let dydxToken: DydxToken;
    let merkleDistributor: MerkleDistributorV1;
    let mockRewardsOracle: MockRewardsOracle;
    let treasurySupply: BigNumber;
    let simpleTree: BalanceTree;
    let waitingPeriod: number;

    before(async () => {
      ({
        dydxToken,
        merkleDistributor,
      } = ctx);

      // Deploy and use mock rewards oracle.
      mockRewardsOracle = await new MockRewardsOracle__factory(deployer).deploy();
      await merkleDistributor.connect(shortTimelockSigner).setRewardsOracle(mockRewardsOracle.address);

      treasurySupply = await dydxToken.balanceOf(ctx.rewardsTreasury.address);

      // Simple tree example that gives all tokens to a single address.
      simpleTree = new BalanceTree({
        [borrower.address]: treasurySupply,
      });

      // Get the waiting period.
      waitingPeriod = (await merkleDistributor.WAITING_PERIOD()).toNumber();

      const mockIpfsCid = Buffer.from('0'.repeat(64), 'hex');
      await mockRewardsOracle.setMockValue(simpleTree.getHexRoot(), 0, mockIpfsCid);
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp(await latestBlockTimestamp() + waitingPeriod);
      await merkleDistributor.updateRoot();
    });

    it('can claim rewards', async () => {
      const proof = simpleTree.getProof(borrower.address, treasurySupply);
      await expect(asWithdrawalOperator.claimRewardsFromMerkleDistributor(
        treasurySupply,
        proof,
      ))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(borrower.address, treasurySupply);
    });
  });
});
