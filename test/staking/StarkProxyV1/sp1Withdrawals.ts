import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';
import {
  evmSnapshot,
  evmRevert,
  incrementTimeToTimestamp,
  timeLatest,
} from '../../../helpers/misc-utils';
import { StakingHelper } from '../../test-helpers/staking-helper';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../../types/MintableErc20';
import { expect } from 'chai';
import { StarkProxyV1 } from '../../../types/StarkProxyV1';
import { ZERO_ADDRESS } from '../../../helpers/constants';
import { MockStarkPerpetual } from '../../../types/MockStarkPerpetual';
import { deployMockRewardsOracle } from '../../../helpers/contracts-deployments';
import { sendAllTokensToTreasury } from '../../test-helpers/treasury-utils';
import BalanceTree from '../../../src/merkle-tree-helpers/balance-tree';
import { MerkleDistributorV1 } from '../../../types/MerkleDistributorV1';
import { Treasury } from '../../../types/Treasury';
import { DydxToken } from '../../../types/DydxToken';
import { MockRewardsOracle } from '../../../types/MockRewardsOracle';
import { BigNumber } from 'ethers';

// Snapshots
const snapshots = new Map<string, string>();
const fundsStakedSnapshot = 'FundsStaked';
const borrowerHasBorrowed = 'BorrowerHasBorrowed';

const stakerInitialBalance: number = 1_000_000;

makeSuite('SP1Withdrawals', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let liquidityStaking: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let mockStarkPerpetual: MockStarkPerpetual;

  // Users.
  let staker: SignerWithAddress;
  let exchangeOperator: SignerWithAddress;
  let withdrawalOperator: SignerWithAddress;
  let borrower: StarkProxyV1;
  let asExchangeOperator: StarkProxyV1;
  let asWithdrawalOperator: StarkProxyV1;

  let contract: StakingHelper;

  before(async () => {
    ({
      liquidityStaking,
      mockStakedToken,
      mockStarkPerpetual,
      rewardsTreasury,
      deployer,
    } = testEnv);

    // Users.
    [staker, exchangeOperator, withdrawalOperator] = testEnv.users;
    [borrower] = testEnv.starkProxyV1Borrowers;

    // Grant roles.
    await borrower.grantRole(await borrower.BORROWER_ROLE(), deployer.address);
    await borrower.grantRole(await borrower.EXCHANGE_OPERATOR_ROLE(), deployer.address);
    await borrower.grantRole(await borrower.EXCHANGE_OPERATOR_ROLE(), exchangeOperator.address);
    await borrower.grantRole(await borrower.WITHDRAWAL_OPERATOR_ROLE(), withdrawalOperator.address);
    asExchangeOperator = borrower.connect(exchangeOperator.signer);
    asWithdrawalOperator = borrower.connect(withdrawalOperator.signer);

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStaking,
      mockStakedToken,
      rewardsTreasury,
      deployer,
      deployer,
      [staker, borrower, exchangeOperator],
      false,
    );

    // Mint staked tokens and set allowances.
    await contract.mintAndApprove(staker, stakerInitialBalance);

    // Initial stake of 1M.
    const distributionStart = (await liquidityStaking.DISTRIBUTION_START()).toNumber();
    await incrementTimeToTimestamp(distributionStart);
    await contract.stake(staker, stakerInitialBalance);
    saveSnapshot(fundsStakedSnapshot);
  });

  describe('Borrower, after borrowing funds', () => {

    before(async () => {
      await loadSnapshot(fundsStakedSnapshot);

      // Allocations: [40%, 60%]
      await contract.setBorrowerAllocations({
        [borrower.address]: 0.4,
        [ZERO_ADDRESS]: 0.6,
      });

      // Borrow full amount.
      await contract.elapseEpoch();
      await contract.fullBorrowViaProxy(borrower, stakerInitialBalance * 0.4);
      expect(await mockStakedToken.balanceOf(borrower.address)).to.equal(
        stakerInitialBalance * 0.4
      );

      await saveSnapshot(borrowerHasBorrowed);
    });

    it('Can use non-borrowed funds on the exchagne, and withdrawal operator can withdraw those funds', async () => {
      const borrowedAmount = stakerInitialBalance * 0.4;
      const [starkKey, assetType, vaultId] = [123, 456, 789];
      await mockStarkPerpetual.registerUser(borrower.address, starkKey, []);
      await borrower.allowStarkKey(starkKey);

      // Deposit borrowed funds to the exchange.
      await asExchangeOperator.depositToExchange(starkKey, assetType, vaultId, borrowedAmount);

      // Deposit own, un-borrowed funds to the exchange.
      const ownFundsAmount = 1_200_000;
      await contract.mintAndApprove(borrower, ownFundsAmount);
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
        .to.be.revertedWith('SP1Withdrawals: Amount exceeds withdrawable balance');

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
    let rewardsTreasury: Treasury;
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
        rewardsTreasury,
      } = testEnv);

      // Deploy and use mock rewards oracle.
      mockRewardsOracle = await deployMockRewardsOracle();
      await merkleDistributor.connect(deployer.signer).setRewardsOracle(mockRewardsOracle.address);

      // Send all tokens to the rewards treasury.
      await sendAllTokensToTreasury(testEnv);
      treasurySupply = await dydxToken.balanceOf(rewardsTreasury.address)

      // Simple tree example that gives all tokens to a single address.
      simpleTree = new BalanceTree({
        [borrower.address]: treasurySupply,
      });

      // Get the waiting period.
      waitingPeriod = (await merkleDistributor.WAITING_PERIOD()).toNumber();

      const mockIpfsCid = Buffer.from('0'.repeat(64), 'hex');
      await mockRewardsOracle.setMockValue(simpleTree.getHexRoot(), 0, mockIpfsCid);
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
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

  async function saveSnapshot(label: string): Promise<void> {
    snapshots.set(label, await evmSnapshot());
    contract.saveSnapshot(label);
  }

  async function loadSnapshot(label: string): Promise<void> {
    const snapshot = snapshots.get(label);
    if (!snapshot) {
      throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
    }
    await evmRevert(snapshot);
    snapshots.set(label, await evmSnapshot());
    contract.loadSnapshot(label);
  }
});
