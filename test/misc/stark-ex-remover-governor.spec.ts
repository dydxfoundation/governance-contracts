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
import { MockStarkPerpetual } from '../../types/MockStarkPerpetual';
import { deployMockStarkPerpetual, deployStarkExRemoverGovernor } from '../../helpers/contracts-deployments';
import { StarkExRemoverGovernor } from '../../types/StarkExRemoverGovernor';
import { tEthereumAddress } from '../../src/tx-builder/types/index';

const snapshots = new Map<string, string>();
const afterSetup: string = 'afterSetup';

makeSuite('StarkEx remover governor', deployPhase2, (testEnv: TestEnv) => {
  let starkEx: MockStarkPerpetual;
  let remover: StarkExRemoverGovernor;
  let initialGovernor: SignerWithAddress;

  before(async () => {
    starkEx = testEnv.mockStarkPerpetual;
    remover = testEnv.starkExRemoverGovernor;

    initialGovernor = testEnv.mockGovernorToRemove;

    // Set initial governor.
    await starkEx.connect(initialGovernor.signer).mainAcceptGovernance();
    await starkEx.connect(initialGovernor.signer).proxyAcceptGovernance();

    snapshots.set(afterSetup, await evmSnapshot());
  });

  afterEach(async () => {
    await revertTestChanges();
  });

  it('accepts governance', async () => {
    expect(await starkEx._MAIN_GOVERNORS_(remover.address)).to.be.false;
    expect(await starkEx._PROXY_GOVERNORS_(remover.address)).to.be.false;

    await remover.mainAcceptGovernance();
    await remover.proxyAcceptGovernance();

    expect(await starkEx._MAIN_GOVERNORS_(remover.address)).to.be.true;
    expect(await starkEx._PROXY_GOVERNORS_(remover.address)).to.be.true;
  });

  it('removes the target governor', async () => {
    expect(await starkEx._MAIN_GOVERNORS_(initialGovernor.address)).to.be.true;
    expect(await starkEx._PROXY_GOVERNORS_(initialGovernor.address)).to.be.true;

    await remover.mainAcceptGovernance();
    await remover.mainRemoveGovernor();

    await remover.proxyAcceptGovernance();
    await remover.proxyRemoveGovernor();

    expect(await starkEx._MAIN_GOVERNORS_(initialGovernor.address)).to.be.false;
    expect(await starkEx._PROXY_GOVERNORS_(initialGovernor.address)).to.be.false;
  });
});

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(afterSetup)!);
  // retake snapshot since each snapshot can be used once
  snapshots.set(afterSetup, await evmSnapshot());
}
