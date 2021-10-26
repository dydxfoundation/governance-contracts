import BNJS from 'bignumber.js';
import { BigNumber } from 'ethers';
import { expect } from 'chai';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import {
  evmRevert,
  evmSnapshot,
} from '../../helpers/misc-utils';
import { Treasury } from '../../types/Treasury';
import { DydxToken } from '../../types/DydxToken';
import { tEthereumAddress } from '../../helpers/types';

const snapshots = new Map<string, string>();
const afterDeploy: string = 'afterDeploy';

makeSuite(
  'dYdX Treasury tests',
  deployPhase2,
  (testEnv: TestEnv) => {

    let treasury: Treasury;
    let token: DydxToken;
    let owner: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
      treasury = testEnv.rewardsTreasury;
      owner = testEnv.deployer;
      nonOwner = testEnv.users[0];
      token = testEnv.dydxToken;

      snapshots.set(afterDeploy, await evmSnapshot())
    });

    describe('approve', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Can not call approve with non owner", async () => {
        await expect(treasury.connect(nonOwner.signer).approve(token.address, nonOwner.address, 1))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })

      it("Owner can approve tokens to address", async () => {
        const amount: number = 777;

        const nonOwnerAllowanceBefore: BigNumber = await token.allowance(treasury.address, nonOwner.address);

        await expect(treasury.approve(token.address, nonOwner.address, amount))
          .to.emit(token, 'Approval')
          .withArgs(treasury.address, nonOwner.address, amount);


        const nonOwnerAllowanceAfter: BigNumber = await token.allowance(treasury.address, nonOwner.address);
        expect(nonOwnerAllowanceAfter.sub(nonOwnerAllowanceBefore)).to.equal(amount);
      })
    });

    describe('transfer', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Can not call transfer with non owner", async () => {
        await expect(treasury.connect(nonOwner.signer).transfer(token.address, nonOwner.address, 1))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })

      it("Owner can transfer tokens to address", async () => {
        const amount: number = 777;

        const [
          treasuryBalanceBefore,
          nonOwnerBalanceBefore,
        ]: [
          BigNumber,
          BigNumber,
        ] = await Promise.all([
          token.balanceOf(treasury.address),
          token.balanceOf(nonOwner.address),
        ]);

        await expect(treasury.transfer(token.address, nonOwner.address, amount))
          .to.emit(token, 'Transfer')
          .withArgs(treasury.address, nonOwner.address, amount);

        const [
          treasuryBalanceAfter,
          nonOwnerBalanceAfter,
        ]: [
          BigNumber,
          BigNumber,
        ] = await Promise.all([
          token.balanceOf(treasury.address),
          token.balanceOf(nonOwner.address),
        ]);

        expect(treasuryBalanceBefore.sub(treasuryBalanceAfter)).to.equal(amount);
        expect(nonOwnerBalanceAfter.sub(nonOwnerBalanceBefore)).to.equal(amount);
      })
    });

    describe('transferOwnership', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Can not call transferOwnership with non owner", async () => {
        await expect(treasury.connect(nonOwner.signer).transferOwnership(nonOwner.address))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })

      it("Owner can transfer ownership to address", async () => {
        await expect(treasury.transferOwnership(nonOwner.address))
          .to.emit(treasury, 'OwnershipTransferred')
          .withArgs(owner.address, nonOwner.address);

        const newOwner: tEthereumAddress = await treasury.owner();
        expect(newOwner).to.equal(nonOwner.address);
      })
    });
  }
);

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(afterDeploy) || '1');
  snapshots.set(afterDeploy, await evmSnapshot())
}
