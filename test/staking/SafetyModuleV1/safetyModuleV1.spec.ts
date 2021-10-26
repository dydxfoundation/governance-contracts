import { deployPhase2, makeSuite, SignerWithAddress, TestEnv } from '../../test-helpers/make-suite';
import { evmRevert, evmSnapshot, timeLatest } from '../../../helpers/misc-utils';
import { BLACKOUT_WINDOW, EPOCH_LENGTH } from '../../../helpers/constants';
import { SafetyModuleV1 } from '../../../types/SafetyModuleV1';
import { expect } from 'chai';
import { DydxToken } from '../../../types/DydxToken';
import { DEPLOY_CONFIG } from '../../../tasks/helpers/deploy-config';

const snapshots = new Map<string, string>();
const snapshotName = 'init';

makeSuite('SafetyModuleV1', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let safetyModule: SafetyModuleV1;
  let dydxToken: DydxToken;

  // Users.
  let staker1: SignerWithAddress;

  before(async () => {
    ({
      safetyModule,
      dydxToken,
      rewardsTreasury,
      deployer,
    } = testEnv);

    // Users.
    [staker1] = testEnv.users.slice(1);

    snapshots.set(snapshotName, await evmSnapshot());
  });

  afterEach(async () => {
    await evmRevert(snapshots.get(snapshotName)!);
    snapshots.set(snapshotName, await evmSnapshot());
  });

  describe('Initial parameters', () => {

    it('Staked token is set during initialization', async () => {
      expect(await safetyModule.STAKED_TOKEN()).to.be.equal(dydxToken.address);
    });

    it('Rewards token is set during initialization', async () => {
      expect(await safetyModule.REWARDS_TOKEN()).to.be.equal(dydxToken.address);
    });

    it('Deployer has proper roles set during initialization and is admin of all roles', async () => {
      const roles: string[] = await Promise.all([
        safetyModule.OWNER_ROLE(),
        safetyModule.EPOCH_PARAMETERS_ROLE(),
        safetyModule.REWARDS_RATE_ROLE(),
      ]);

      // deployer should have all roles except claimOperator, stakeOperator, and debtOperator.
      for (const role of roles) {
        expect(await safetyModule.hasRole(role, deployer.address)).to.be.true;
      }

      const stakeOperatorRole: string = await safetyModule.STAKE_OPERATOR_ROLE();
      expect(await safetyModule.hasRole(stakeOperatorRole, deployer.address)).to.be.false;

      const ownerRole: string = roles[0];
      const allRoles: string[] = roles.concat(stakeOperatorRole);
      for (const role of allRoles) {
        expect(await safetyModule.getRoleAdmin(role)).to.equal(ownerRole);
      }
    });

    it('Rewards vault is set during initialization', async () => {
      expect(await safetyModule.REWARDS_TREASURY()).to.be.equal(rewardsTreasury.address);
    });

    it('Blackout window is set during initialization', async () => {
      expect(await safetyModule.getBlackoutWindow()).to.be.equal(BLACKOUT_WINDOW.toString());
    });

    it('Emissions per second is initially zero', async () => {
      expect(await safetyModule.getRewardsPerSecond()).to.be.equal(DEPLOY_CONFIG.SAFETY_MODULE.REWARDS_PER_SECOND);
    });

    it('Epoch parameters are set during initialization', async () => {
      const timeLatestString: string = (await timeLatest()).toString();

      const epochParameters = await safetyModule.getEpochParameters();
      expect(epochParameters.interval).to.be.equal(EPOCH_LENGTH.toString());
      // expect offset to be at least later than now (was initialized to 60 seconds after current blocktime)
      expect(epochParameters.offset).to.be.at.least(timeLatestString);
    });

    it('Initializes the exchange rate to a value of one', async () => {
      const exchangeRateBase = await safetyModule.EXCHANGE_RATE_BASE();
      const exchangeRate = await safetyModule.getExchangeRate();
      expect(exchangeRate).to.equal(exchangeRateBase);
      expect(exchangeRate).not.to.equal(0);
    });

    it('Total active current balance is initially zero', async () => {
      expect(await safetyModule.getTotalActiveBalanceCurrentEpoch()).to.equal(0);
    });

    it('Total active next balance is initially zero', async () => {
      expect(await safetyModule.getTotalActiveBalanceNextEpoch()).to.equal(0);
    });

    it('Total inactive current balance is initially zero', async () => {
      expect(await safetyModule.getTotalInactiveBalanceCurrentEpoch()).to.equal(0);
    });

    it('Total inactive next balance is initially zero', async () => {
      expect(await safetyModule.getTotalInactiveBalanceNextEpoch()).to.equal(0);
    });

    it('User active current balance is initially zero', async () => {
      expect(await safetyModule.getActiveBalanceCurrentEpoch(staker1.address)).to.equal(0);
    });

    it('User active next balance is initially zero', async () => {
      expect(await safetyModule.getActiveBalanceNextEpoch(staker1.address)).to.equal(0);
    });

    it('User inactive current balance is initially zero', async () => {
      expect(await safetyModule.getInactiveBalanceCurrentEpoch(staker1.address)).to.equal(0);
    });

    it('User inactive next balance is initially zero', async () => {
      expect(await safetyModule.getInactiveBalanceNextEpoch(staker1.address)).to.equal(0);
    });
  });
});
