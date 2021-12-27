import BNJS from 'bignumber.js';
import {expect} from 'chai';
import { BigNumber } from 'ethers';
import { formatEther, formatUnits } from 'ethers/lib/utils';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import {
  evmRevert,
  evmSnapshot,
  DRE,
  waitForTx,
  timeLatest,
  toWad,
  incrementTimeToTimestamp,
} from '../../helpers/misc-utils';
import { TxBuilder, Network } from '../../src';
import { tStringDecimalUnits } from '../../src/tx-builder/types';
import { parseNumberToEthersBigNumber } from '../../src/tx-builder/utils/parsings';
import { DYDX_TOKEN_DECIMALS, LOCKED_ALLOCATION, MERKLE_DISTRIBUTOR_REWARDS_PER_EPOCH, ONE_DAY_SECONDS, RETROACTIVE_MINING_REWARDS } from '../../src/tx-builder/config/index';
import { DEPLOY_CONFIG } from '../../tasks/helpers/deploy-config';
import { deployMockRewardsOracle, deployMulticall2 } from '../../helpers/contracts-deployments';
import { MerkleDistributorV1 } from '../../types/MerkleDistributorV1';
import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import { ipfsBytes32Hash, ONE_DAY } from '../../helpers/constants';
import { MockRewardsOracle } from '../../types/MockRewardsOracle';
import { Multicall2 } from '../../types/Multicall2';

const snapshots = new Map<string, string>();

const beforeTransferRestriction = 'beforeTransferRestriction';
const afterTransferRestriction = 'afterTransferRestriction';
const afterRootUpdate = 'afterRootUpdate';

makeSuite('dYdX client DYDX token tests', deployPhase2, (testEnv: TestEnv) => {
  let txBuilder: TxBuilder;
  let distributor: SignerWithAddress;
  let transfersRestrictedBefore: BigNumber;

  // 0.1585489619 rewards per second * 60 seconds * 60 minutes * 24 hours
  const liquidityModuleRewardsPerDay: BNJS = new BNJS('13698.63030816');
  const safetyModuleRewardsPerDay: BNJS = new BNJS('13698.63030816');

  before(async () => {
    distributor = testEnv.deployer;

    const multicall: Multicall2 = await deployMulticall2();

    const hardhatProvider = DRE.ethers.provider;
    txBuilder = new TxBuilder({
      hardhatTokenAddresses: {
        TOKEN_ADDRESS: testEnv.dydxToken.address,
      },
      hardhatTreasuryAddresses: {
        REWARDS_TREASURY_ADDRESS: testEnv.rewardsTreasury.address,
        REWARDS_TREASURY_VESTER_ADDRESS: testEnv.rewardsTreasuryVester.address,
        COMMUNITY_TREASURY_ADDRESS: testEnv.communityTreasury.address,
        COMMUNITY_TREASURY_VESTER_ADDRESS: testEnv.communityTreasuryVester.address,
      },
      hardhatSafetyModuleAddresses: {
        SAFETY_MODULE_ADDRESS: testEnv.safetyModule.address,
      },
      hardhatLiquidityModuleAddresses: {
        LIQUIDITY_MODULE_ADDRESS: testEnv.liquidityStaking.address,
      },
      hardhatMerkleDistributorAddresses: {
        MERKLE_DISTRIBUTOR_ADDRESS: testEnv.merkleDistributor.address,
      },
      hardhatMulticallAddresses: {
        MULTICALL_ADDRESS: multicall.address,
      },
      network: Network.hardhat,
      injectedProvider: hardhatProvider,
    });

    transfersRestrictedBefore = await testEnv.dydxToken._transfersRestrictedBefore();

    snapshots.set(beforeTransferRestriction, await evmSnapshot());
  });

  describe('before transfer restriction', () => {

    it('Can read circulating supply of token before transfer restriction', async () => {
      // circulating supply is 0 before end of transfer restriction
      const circulatingSupply: tStringDecimalUnits = await txBuilder.dydxTokenService.circulatingSupply();

      expect(circulatingSupply).to.equal('0.0');
    });

    it('Can read tokens distributed today before transfer restriction', async () => {
      // distributed today is 0 before end of transfer restriction
      const distributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      expect(distributedToday).to.equal('0.0');
    });
  });

  describe('after transfer restriction', () => {

    before(async () => {
      await incrementTimeToTimestamp(transfersRestrictedBefore.toNumber());

      snapshots.set(afterTransferRestriction, await evmSnapshot());
    });

    afterEach(async () => {
      await revertTestChanges(afterTransferRestriction);
    });

    after(async () => {
      await revertTestChanges(beforeTransferRestriction);
    });

    it('Can read distributor balance', async () => {
      const distributorBalance: tStringDecimalUnits = await txBuilder.dydxTokenService.balanceOf(distributor.address);

      // distributor owns all tokens minus rewards treasury tokens after phase 2 deployment
      const expectedDistributorBalance: BigNumber = BigNumber.from(
        toWad(1_000_000_000)).sub(DEPLOY_CONFIG.REWARDS_TREASURY.FRONTLOADED_FUNDS);
      expect(distributorBalance).to.equal(formatEther(expectedDistributorBalance));
    });

    it('Can read token decimals', async () => {
      const tokenDecimals: number = await txBuilder.dydxTokenService.decimalsOf();

      expect(tokenDecimals).to.equal(DYDX_TOKEN_DECIMALS);
    });

    it('Distributor balance updates after sending tokens', async () => {
      const user1 = testEnv.users[0];

      const preTransferDistributorBalanceWei: BigNumber = await testEnv.dydxToken.balanceOf(distributor.address);

      const transferAmount: string = '10.0';
      const transferAmountWei: BigNumber = parseNumberToEthersBigNumber(transferAmount, DYDX_TOKEN_DECIMALS);
      await waitForTx(await testEnv.dydxToken.transfer(user1.address, transferAmountWei));

      const [
        distributorBalance,
        user1Balance,
      ]: [
        tStringDecimalUnits,
        tStringDecimalUnits,
      ] = await Promise.all([
        txBuilder.dydxTokenService.balanceOf(distributor.address),
        txBuilder.dydxTokenService.balanceOf(user1.address),
      ]);

      expect(distributorBalance).to.equal(formatUnits(preTransferDistributorBalanceWei.sub(transferAmountWei), DYDX_TOKEN_DECIMALS));
      expect(user1Balance).to.equal(transferAmount);
    });

    it('Can read total supply of token', async () => {
      const totalSupply: tStringDecimalUnits = await txBuilder.dydxTokenService.totalSupply();

      expect(totalSupply).to.equal('1000000000.0');
    });

    it('Can read circulating supply of token after transfer restriction', async () => {
      const circulatingSupply: tStringDecimalUnits = await txBuilder.dydxTokenService.circulatingSupply();

      const distributorBalance: BigNumber = await testEnv.dydxToken.balanceOf(distributor.address);
      // Tokens held by distributor are liquid (minus locked tokens)
      const expectedCirculatingSupplyWei: BigNumber = distributorBalance.sub(toWad(new BNJS(LOCKED_ALLOCATION).toString()));
      expect(circulatingSupply).to.equal(formatEther(expectedCirculatingSupplyWei));
    });

    it('Can read tokens distributed today after transfer restriction', async () => {
      const tokensDistributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      // within one day of transfer restriction end, we take into account an additional 36 days of liquidity
      // module rewards becoming liquid
      expect(tokensDistributedToday).to.equal(safetyModuleRewardsPerDay
        .plus(liquidityModuleRewardsPerDay.multipliedBy(37))
        .toString()
      );
    });

    it('Can read tokens distributed today more than one day after transfer restriction', async () => {
      await incrementTimeToTimestamp(transfersRestrictedBefore.add(ONE_DAY.toNumber()).toNumber() + 1);

      const tokensDistributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      expect(tokensDistributedToday).to.equal(safetyModuleRewardsPerDay.plus(liquidityModuleRewardsPerDay).toString());
    });
  });

  describe('with merkle root update', () => {

    let simpleTree: BalanceTree;
    let simpleTreeRoot: string;
    let waitingPeriod: number;
    let merkleDistributor: MerkleDistributorV1;
    let mockRewardsOracle: MockRewardsOracle;

    before(async () => {
      await revertTestChanges(beforeTransferRestriction);

      merkleDistributor = testEnv.merkleDistributor;

      // Deploy and use mock rewards oracle.
      mockRewardsOracle = await deployMockRewardsOracle();
      await merkleDistributor.setRewardsOracle(mockRewardsOracle.address);

      // Simple tree example that gives 1 token to distributor address.
      simpleTree = new BalanceTree({
        [distributor.address]: 1,
      });
      simpleTreeRoot = simpleTree.getHexRoot();

      // Get the waiting period.
      waitingPeriod = (await merkleDistributor.WAITING_PERIOD()).toNumber();

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        ipfsBytes32Hash,
      );
      await merkleDistributor.proposeRoot();

      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      await merkleDistributor.updateRoot();

      snapshots.set(afterRootUpdate, await evmSnapshot());
    });

    afterEach(async () => {
      await revertTestChanges(afterRootUpdate);
    });

    it('Can read distributed today with first root update event before transfer restriction', async () => {
      const tokensDistributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      expect(tokensDistributedToday).to.equal('0.0');
    });

    it('Can read distributed today with first root update event after transfer restriction (includes retroactive rewards)', async () => {
      await incrementTimeToTimestamp(transfersRestrictedBefore.toNumber());

      const tokensDistributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      const expectedTokensDistributedToday = safetyModuleRewardsPerDay
        .plus(liquidityModuleRewardsPerDay.multipliedBy(37))
        .plus(MERKLE_DISTRIBUTOR_REWARDS_PER_EPOCH)
        .plus(RETROACTIVE_MINING_REWARDS)
        .toString();
      expect(tokensDistributedToday).to.equal(expectedTokensDistributedToday);
    });

    it('Can read distributed today with root update event 1 day in the past', async () => {
      await incrementTimeToTimestamp(transfersRestrictedBefore.add(ONE_DAY.toNumber() + 1).toNumber());

      const tokensDistributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      expect(tokensDistributedToday).to.equal(safetyModuleRewardsPerDay.plus(liquidityModuleRewardsPerDay).toString());
    });

    it('Can read distributed today with second root update event (does not include retroactive rewards)', async () => {
      await incrementTimeToTimestamp(transfersRestrictedBefore.add(ONE_DAY.toNumber() + 1).toNumber());

      const simpleTreeRoot2 = simpleTree.getHexRoot();

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot2,
        1,
        ipfsBytes32Hash,
      );
      await merkleDistributor.proposeRoot();

      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      await merkleDistributor.updateRoot();
      const tokensDistributedToday: tStringDecimalUnits = await txBuilder.dydxTokenService.distributedToday();

      const expectedTokensDistributedToday = safetyModuleRewardsPerDay
        .plus(liquidityModuleRewardsPerDay)
        .plus(MERKLE_DISTRIBUTOR_REWARDS_PER_EPOCH)
        .toString();
      expect(tokensDistributedToday).to.equal(expectedTokensDistributedToday);
    });
  });
});

async function revertTestChanges(snapshotName: string): Promise<void> {
  await evmRevert(snapshots.get(snapshotName)!);
  // retake snapshot since each snapshot can only be used once
  snapshots.set(snapshotName, await evmSnapshot());
}
