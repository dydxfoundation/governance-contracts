import { expect, use } from 'chai';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
} from '../test-helpers/make-suite';
import { BigNumber } from 'ethers';
import { formatEther } from 'ethers/lib/utils';
import { solidity } from 'ethereum-waffle';
import {
  evmRevert,
  evmSnapshot,
  DRE,
  toWad,
} from '../../helpers/misc-utils';
import { TxBuilder, Network } from '../../src';
import { tStringDecimalUnits } from '../../src/tx-builder/types';
import { DEPLOY_CONFIG } from '../../tasks/helpers/deploy-config';

const snapshots = new Map<string, string>();

makeSuite('dYdX client ERC20 tests', deployPhase2, (testEnv: TestEnv) => {
  let txBuilder: TxBuilder;

  before(async () => {
    const hardhatProvider = DRE.ethers.provider;
    txBuilder = new TxBuilder({
      network: Network.hardhat,
      injectedProvider: hardhatProvider,
    });

    snapshots.set('start', await evmSnapshot());
  });

  afterEach(async () => {
    // Revert to starting state
    await evmRevert(snapshots.get('start') || '1');
    // EVM Snapshots are consumed, need to snapshot again for next test
    snapshots.set('start', await evmSnapshot());
  });

  it('Can read distributor balance', async () => {
    const distributor = testEnv.deployer;

    const distributorBalance: tStringDecimalUnits = await txBuilder.erc20Service.balanceOf(testEnv.dydxToken.address, distributor.address);

    // distributor owns all tokens minus rewards treasury tokens after phase 2 deployment
    const expectedDistributorBalance: BigNumber = BigNumber.from(
      toWad(1_000_000_000)).sub(DEPLOY_CONFIG.REWARDS_TREASURY.FRONTLOADED_FUNDS);

    expect(distributorBalance).to.equal(formatEther(expectedDistributorBalance));
  })
});
