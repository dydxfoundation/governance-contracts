import { makeSuite, TestEnv } from '../helpers/make-suite';
import { timeLatest } from '../../helpers/misc-utils';
import { BLACKOUT_WINDOW, EPOCH_LENGTH } from '../../helpers/constants';
import { SignerWithAddress } from '../helpers/make-suite';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MockStakedToken } from '../../types/MockStakedToken';
import { MintableErc20 } from '../../types/MintableErc20';
import { expect } from 'chai';

makeSuite('LiquidityStakingV1', (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsVault: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MockStakedToken;
  let dydxToken: MintableErc20;

  // Users.
  let staker1: SignerWithAddress;

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStakingV1;
    mockStakedToken = testEnv.mockStakedToken;
    dydxToken = testEnv.dydxToken;
    rewardsVault = testEnv.rewardsVault;
    deployer = testEnv.deployer;
    // Users.
    [staker1] = testEnv.users.slice(1);
  });

  describe('Initial parameters', () => {
    it('Staked token is set during initialization', async () => {
      expect(await liquidityStakingV1.STAKED_TOKEN()).to.be.equal(mockStakedToken.address);
    });

    it('Rewards token is set during initialization', async () => {
      expect(await liquidityStakingV1.REWARDS_TOKEN()).to.be.equal(dydxToken.address);
    });

    it('Deployer has proper roles set during initialization and is admin of all roles', async () => {
      const roles: string[] = await Promise.all([
        liquidityStakingV1.OWNER_ROLE(),
        liquidityStakingV1.EPOCH_PARAMETERS_ROLE(),
        liquidityStakingV1.REWARDS_RATE_ROLE(),
        liquidityStakingV1.BORROWER_ADMIN_ROLE(),
      ]);

      // deployer should have all roles except claimOperator, stakeOperator, and debtOperator.
      for (const role of roles) {
        expect(await liquidityStakingV1.hasRole(role, deployer.address)).to.be.true;
      }

      const stakeOperatorRole: string = await liquidityStakingV1.STAKE_OPERATOR_ROLE();
      expect(await liquidityStakingV1.hasRole(stakeOperatorRole, deployer.address)).to.be.false;

      const debtOperatorRole: string = await liquidityStakingV1.DEBT_OPERATOR_ROLE();
      expect(await liquidityStakingV1.hasRole(debtOperatorRole, deployer.address)).to.be.false;

      const claimOperatorRole: string = await liquidityStakingV1.CLAIM_OPERATOR_ROLE();
      expect(await liquidityStakingV1.hasRole(debtOperatorRole, deployer.address)).to.be.false;

      const ownerRole: string = roles[0];
      const allRoles: string[] = roles.concat(stakeOperatorRole);
      for (const role of allRoles) {
        expect(await liquidityStakingV1.getRoleAdmin(role)).to.equal(ownerRole);
      }
    });

    it('Rewards vault is set during initialization', async () => {
      expect(await liquidityStakingV1.REWARDS_VAULT()).to.be.equal(rewardsVault.address);
    });

    it('Blackout window is set during initialization', async () => {
      expect(await liquidityStakingV1.getBlackoutWindow()).to.be.equal(BLACKOUT_WINDOW.toString());
    });

    it('Emissions per second is initially zero', async () => {
      expect(await liquidityStakingV1.getRewardsPerSecond()).to.be.equal(0);
    });

    it('Total borrowed balance is initially zero', async () => {
      expect(await liquidityStakingV1.getTotalBorrowedBalance()).to.be.equal(0);
    });

    it('Total borrower debt balance is initially zero', async () => {
      expect(await liquidityStakingV1.getTotalBorrowerDebtBalance()).to.be.equal(0);
    });

    it('Epoch parameters are set during initialization', async () => {
      const timeLatestString: string = (await timeLatest()).toString();

      const epochParameters = await liquidityStakingV1.getEpochParameters();
      expect(epochParameters.interval).to.be.equal(EPOCH_LENGTH.toString());
      // expect offset to be at least later than now (was initialized to 60 seconds after current blocktime)
      expect(epochParameters.offset).to.be.at.least(timeLatestString);
    });

    it('Total active current balance is initially zero', async () => {
      expect(await liquidityStakingV1.getTotalActiveBalanceCurrentEpoch()).to.equal(0);
    });

    it('Total active next balance is initially zero', async () => {
      expect(await liquidityStakingV1.getTotalActiveBalanceNextEpoch()).to.equal(0);
    });

    it('Total inactive current balance is initially zero', async () => {
      expect(await liquidityStakingV1.getTotalInactiveBalanceCurrentEpoch()).to.equal(0);
    });

    it('Total inactive next balance is initially zero', async () => {
      expect(await liquidityStakingV1.getTotalInactiveBalanceNextEpoch()).to.equal(0);
    });

    it('User active current balance is initially zero', async () => {
      expect(await liquidityStakingV1.getActiveBalanceCurrentEpoch(staker1.address)).to.equal(0);
    });

    it('User active next balance is initially zero', async () => {
      expect(await liquidityStakingV1.getActiveBalanceNextEpoch(staker1.address)).to.equal(0);
    });

    it('User inactive current balance is initially zero', async () => {
      expect(await liquidityStakingV1.getInactiveBalanceCurrentEpoch(staker1.address)).to.equal(0);
    });

    it('User inactive next balance is initially zero', async () => {
      expect(await liquidityStakingV1.getInactiveBalanceNextEpoch(staker1.address)).to.equal(0);
    });

    it('Staker debt balance is initially zero', async () => {
      expect(await liquidityStakingV1.getStakerDebtBalance(staker1.address)).to.equal(0);
    });
  });
});
