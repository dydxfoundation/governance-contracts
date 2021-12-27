import { expect, use } from 'chai';
import { solidity } from 'ethereum-waffle';

import {
  evmRevert,
  evmSnapshot,
} from '../../helpers/misc-utils';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';
import { deployMockStarkPerpetual, deployStarkExHelperGovernor, deployStarkExRemoverGovernor } from '../../helpers/contracts-deployments';
import { StarkExHelperGovernor } from '../../types/StarkExHelperGovernor';

const snapshots = new Map<string, string>();
const afterSetup: string = 'afterSetup';
const zeroBytes32 = padHex256('0x0');
const exampleHash = padHex256('0x000123');

makeSuite('StarkEx helper governor', deployPhase2, (testEnv: TestEnv) => {
  let starkEx: MockStarkPerpetual;
  let helper: StarkExHelperGovernor;
  let users: SignerWithAddress[];
  let notOwner: SignerWithAddress;
  let addrs: string[];

  before(async () => {
    users = testEnv.users;
    notOwner = users[0];
    addrs = users.map(u => u.address);

    // Deploy contracts.
    starkEx = testEnv.mockStarkPerpetual;
    helper = testEnv.starkExHelperGovernor;

    // Check owner is not `notOwner`.
    expect(await helper.owner()).not.to.equal(notOwner.address);

    snapshots.set(afterSetup, await evmSnapshot());
  });

  afterEach(async () => {
    await revertTestChanges();
  });

  it('accepts governance', async () => {
    expect(await starkEx._MAIN_GOVERNORS_(helper.address)).to.be.false;
    expect(await starkEx._PROXY_GOVERNORS_(helper.address)).to.be.false;

    await helper.mainAcceptGovernance();

    expect(await starkEx._MAIN_GOVERNORS_(helper.address)).to.be.true;
    expect(await starkEx._PROXY_GOVERNORS_(helper.address)).to.be.false; // Still false.
  });

  describe('executeAssetConfigurationChanges', () => {

    beforeEach(async () => {
      await helper.mainAcceptGovernance();
    });

    it('registers and applies zero asset config changes', async () => {
      await helper.executeAssetConfigurationChanges([], []);
      expect(await starkEx._ASSET_CONFIGS_(5)).to.equal(zeroBytes32);
    });

    it('registers and applies one asset config change', async () => {
      await helper.executeAssetConfigurationChanges([5], [exampleHash]);
      expect(await starkEx._ASSET_CONFIGS_(5)).to.equal(exampleHash);
    });

    it('registers and applies several asset config changes', async () => {
      const configHashes = ['0x05', '0x04', '0x03', '0x02', '0x01'].map(padHex256);
      await helper.executeAssetConfigurationChanges(
        [5, 4, 3, 2, 1],
        configHashes,
      );
      expect(await starkEx._ASSET_CONFIGS_(5)).to.equal(configHashes[0]);
      expect(await starkEx._ASSET_CONFIGS_(4)).to.equal(configHashes[1]);
      expect(await starkEx._ASSET_CONFIGS_(3)).to.equal(configHashes[2]);
      expect(await starkEx._ASSET_CONFIGS_(2)).to.equal(configHashes[3]);
      expect(await starkEx._ASSET_CONFIGS_(1)).to.equal(configHashes[4]);
    });

    it('reverts if called by non-owner', async () => {
      await expect(helper.connect(notOwner.signer).executeAssetConfigurationChanges([5], [exampleHash]))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('executeGlobalConfigurationChange', () => {

    beforeEach(async () => {
      await helper.mainAcceptGovernance();
    });

    it('registers and applies a global config change', async () => {
      expect(await starkEx._GLOBAL_CONFIG_()).to.equal(zeroBytes32);
      await helper.executeGlobalConfigurationChange(exampleHash);
      expect(await starkEx._GLOBAL_CONFIG_()).to.equal(exampleHash);
    });

    it('reverts if called by non-owner', async () => {
      await expect(helper.connect(notOwner.signer).executeGlobalConfigurationChange(exampleHash))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(afterSetup)!);
  // retake snapshot since each snapshot can be used once
  snapshots.set(afterSetup, await evmSnapshot());
}

function padHex256(hex: string): string{
  return `0x${hex.slice(2).padStart(64, '0')}`;
}
