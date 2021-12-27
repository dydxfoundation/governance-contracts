import { BigNumber, BigNumberish, Event } from 'ethers';
import { expect, use } from 'chai';
import { solidity } from 'ethereum-waffle';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import {
  ZERO_ADDRESS,
  ONE_DAY as ONE_DAY_BN,
  ONE_YEAR as ONE_YEAR_BN,
} from '../../helpers/constants';
import { getDydxTokenWithSigner } from '../../helpers/contracts-getters';
import {
  evmRevert,
  evmSnapshot,
  increaseTimeAndMine,
  timeLatest,
  waitForTx,
} from '../../helpers/misc-utils';
import { DEPLOY_CONFIG } from '../../tasks/helpers/deploy-config';
import { toWad } from '../../helpers/misc-utils';
import { tEthereumAddress } from '../../helpers/types';
import { DydxToken } from '../../types/DydxToken';
import { GovernanceStrategy } from '../../types/GovernanceStrategy';

const INITIAL_SUPPLY = BigNumber.from(10).pow(27);
const ONE_YEAR = ONE_YEAR_BN.toNumber(); // The minting interval.

const snapshots = new Map<string, string>();

const afterTokenDeploy: string = 'afterTokenDeploy';

makeSuite(
  'dYdX Token Tests',
  deployPhase2,
  (testEnv: TestEnv) => {
    let distributor: SignerWithAddress;
    let executor: SignerWithAddress;
    let dydxToken: DydxToken;
    let dydxTokenWithDistributorSigner: DydxToken;
    let dydxTokenWithGovernanceSigner: DydxToken;
    let dydxTokenWithNonOwnerSigner: DydxToken;
    let strategy: GovernanceStrategy;
    let transfersRestrictedBefore: BigNumber;
    let transferRestrictionLiftedNoLaterThan: BigNumber;
    let mintingRestrictedBefore: BigNumber;
    let tokenDeployedBlockNumber: number;

    before(async () => {
      distributor = testEnv.deployer;
      executor = testEnv.users[0];
      dydxToken = testEnv.dydxToken;
      dydxTokenWithDistributorSigner = await getDydxTokenWithSigner(distributor.signer);
      dydxTokenWithGovernanceSigner = await getDydxTokenWithSigner(distributor.signer);
      dydxTokenWithNonOwnerSigner = dydxToken.connect(testEnv.users[1].signer);
      strategy = testEnv.strategy;
      transfersRestrictedBefore = await dydxToken._transfersRestrictedBefore();
      transferRestrictionLiftedNoLaterThan = await dydxToken.TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN();
      mintingRestrictedBefore = await dydxToken._mintingRestrictedBefore();

      tokenDeployedBlockNumber = await getLatestMintBlockNumber(dydxToken);

      snapshots.set(afterTokenDeploy, await evmSnapshot())
    });

    describe('Constants', () => {
      it("Has given name", async () => {
        expect(await dydxToken.name()).to.equal('dYdX');
      })

      it("Has given symbol", async () => {
        expect(await dydxToken.symbol()).to.equal('DYDX');
      });

      it("Has 18 decimals", async () => {
        expect(await dydxToken.decimals()).to.equal(18);
      });

      it("Has initial supply of one billion", async () => {
        expect(await dydxToken.INITIAL_SUPPLY()).to.equal(INITIAL_SUPPLY);
      });

      it("Has mint min interval of one year", async () => {
        expect(await dydxToken.MINT_MIN_INTERVAL()).to.equal(ONE_YEAR);
      });

      it("Has mint max percent of 2", async () => {
        expect(await dydxToken.MINT_MAX_PERCENT()).to.equal(2);
      });

      it("Owner is set to token distributor", async () => {
        expect(await dydxToken.owner()).to.equal(distributor.address);
      });

      it("Distributor and treasuries are in transfer allowlist", async () => {
        expect(await dydxToken._tokenTransferAllowlist(distributor.address)).to.be.true;
        expect(await dydxToken._tokenTransferAllowlist(testEnv.rewardsTreasury.address)).to.be.true;
        expect(await dydxToken._tokenTransferAllowlist(testEnv.communityTreasury.address)).to.be.true;
      });

      it("Has the EIP 712 domain hash", async () => {
        expect(await dydxToken.EIP712_DOMAIN()).to.equal(
          '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f',
        );
      });

      it("Has the permit typehash", async () => {
        expect(await dydxToken.PERMIT_TYPEHASH()).to.equal(
          '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9',
        );
      });

      it("Has initial total supply snapshot and voting + proposition supply", async () => {
        await expectTotalSupplySnapshotsCount(1);
        await expectTotalSupplySnapshot(0, tokenDeployedBlockNumber, INITIAL_SUPPLY);

        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber, INITIAL_SUPPLY);
      });

      it("voting + proposition supply is 0 before deployment block number", async () => {
        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber - 1, 0);
      });

      it("voting + proposition supply is initial supply after deployment block number", async () => {
        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber + 1, INITIAL_SUPPLY);
      });
    });

    describe('balanceOf', () => {
      it("Grants 100% of supply - rewards treasury frontloaded funds to distributor", async () => {
        const distributorBalance: BigNumber = await dydxToken.balanceOf(testEnv.deployer.address);
        expect(distributorBalance).to.equal(
          BigNumber.from(toWad(1_000_000_000)).sub(DEPLOY_CONFIG.REWARDS_TREASURY.FRONTLOADED_FUNDS));

        const totalSupply: BigNumber = await dydxToken.totalSupply();
        expect(totalSupply).to.equal(distributorBalance.add(DEPLOY_CONFIG.REWARDS_TREASURY.FRONTLOADED_FUNDS));
      })
    });

    describe('mint', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Non-minter addresses cannot mint", async () => {
        await expect(dydxTokenWithNonOwnerSigner.mint(executor.address, 1))
          .to.be.revertedWith('Ownable: caller is not the owner');
      })

      it("Reverts if minter mints before _mintingRestrictedBefore", async () => {
        await advanceTimeTo(transfersRestrictedBefore);
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, 1)).to.be.revertedWith(
          'MINT_TOO_EARLY',
        );
      })

      it("Reverts if mint recipient is the zero address", async () => {
        await advanceTimeTo(mintingRestrictedBefore);
        await expect(dydxTokenWithGovernanceSigner.mint(ZERO_ADDRESS, 1)).to.be.revertedWith(
          'ERC20: mint to the zero address',
        );
      })

      it("Minter can mint at time _mintingRestrictedBefore", async () => {
        const mintAmount = 1;

        await advanceTimeTo(mintingRestrictedBefore);
        const balanceBefore = await dydxTokenWithGovernanceSigner.balanceOf(executor.address);
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, mintAmount))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer')
          .withArgs(ZERO_ADDRESS, executor.address, mintAmount);
        const balanceAfter = await dydxTokenWithGovernanceSigner.balanceOf(executor.address);
        expect(balanceAfter.sub(balanceBefore)).to.equal(mintAmount);
        const mintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterMint: BigNumber = INITIAL_SUPPLY.add(mintAmount);

        // Check total supply.
        expect(await dydxToken.totalSupply()).to.equal(supplyAfterMint);

        // Check total supply snapshots.
        await expectTotalSupplySnapshotsCount(2);
        await expectTotalSupplySnapshot(0, tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalSupplySnapshot(1, mintBlockNumber, supplyAfterMint);

        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(mintBlockNumber, supplyAfterMint);

        // blocks directly after mints should have the same supply
        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber + 1, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(mintBlockNumber + 1, supplyAfterMint);
      })

      it("Minter can mint after _mintingRestrictedBefore", async () => {
        const mintAmount = 1;

        await advanceTimeTo(mintingRestrictedBefore.add(1000));
        const balanceBefore = await dydxTokenWithGovernanceSigner.balanceOf(executor.address);
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, mintAmount))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer')
          .withArgs(ZERO_ADDRESS, executor.address, mintAmount);
        const balanceAfter = await dydxTokenWithGovernanceSigner.balanceOf(executor.address);
        expect(balanceAfter.sub(balanceBefore)).to.equal(mintAmount);
        const mintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterMint: BigNumber = INITIAL_SUPPLY.add(mintAmount);

        // Check total supply.
        expect(await dydxToken.totalSupply()).to.equal(supplyAfterMint);

        // Check total supply snapshots.
        await expectTotalSupplySnapshotsCount(2);
        await expectTotalSupplySnapshot(0, tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalSupplySnapshot(1, mintBlockNumber, supplyAfterMint);

        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(mintBlockNumber, supplyAfterMint);

        // blocks directly after mints should have the same supply
        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber + 1, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(mintBlockNumber + 1, supplyAfterMint);
      })

      it("Minter can mint 2% of the total supply", async () => {
        await advanceTimeTo(mintingRestrictedBefore.add(1000));
        const balanceBefore = await dydxTokenWithGovernanceSigner.balanceOf(executor.address);
        const mintAmount = INITIAL_SUPPLY.div(50);
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, mintAmount))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer')
          .withArgs(ZERO_ADDRESS, executor.address, mintAmount);
        const balanceAfter = await dydxTokenWithGovernanceSigner.balanceOf(executor.address);
        expect(balanceAfter.sub(balanceBefore)).to.equal(mintAmount);
        const firstMintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterFirstMint = INITIAL_SUPPLY.add(mintAmount);

        // Mint second year.
        await advanceTimeTo(mintingRestrictedBefore.add(1100).add(ONE_YEAR).add(100));
        const secondMintAmount = mintAmount.mul(102).div(100);
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, secondMintAmount))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer')
          .withArgs(ZERO_ADDRESS, executor.address, secondMintAmount);
        const secondMintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterSecondMint = INITIAL_SUPPLY.add(mintAmount).add(secondMintAmount);

        // Check total suppply.
        expect(await dydxToken.totalSupply()).to.equal(INITIAL_SUPPLY.add(mintAmount).add(secondMintAmount));

        // Check total supply snapshots.
        await expectTotalSupplySnapshotsCount(3);
        await expectTotalSupplySnapshot(0, tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalSupplySnapshot(1, firstMintBlockNumber, INITIAL_SUPPLY.add(mintAmount));
        await expectTotalSupplySnapshot(2, secondMintBlockNumber, INITIAL_SUPPLY.add(mintAmount).add(secondMintAmount));

        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(firstMintBlockNumber, supplyAfterFirstMint);
        await expectTotalVotingAndPropositionSupply(secondMintBlockNumber, supplyAfterSecondMint);

        // blocks directly after mints should have the same supply
        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber + 1, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(firstMintBlockNumber + 1, supplyAfterFirstMint);
        await expectTotalVotingAndPropositionSupply(secondMintBlockNumber + 1, supplyAfterSecondMint);
      })

      it("Minter cannot mint more than 2% of the total supply", async () => {
        await advanceTimeTo(mintingRestrictedBefore.add(1000));
        const mintAmount = INITIAL_SUPPLY.div(50).add(1);
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, mintAmount)).to.be.revertedWith(
          'MAX_MINT_EXCEEDED',
        );
      })

      it("Reverts if minting again before the min interval has elapsed", async() => {
        await advanceTimeTo(mintingRestrictedBefore.add(1000));
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, 1))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer');
        await advanceTimeTo(mintingRestrictedBefore.add(1000).add(ONE_YEAR - 1));
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, 1)).to.be.revertedWith(
          'MINT_TOO_EARLY',
        );
      })

      it("Minter can mint multiple times, if at least the min interval has elapsed", async () => {
        // Advance time to after mint restriction
        await advanceTimeTo(mintingRestrictedBefore.add(1000));

        // Do the first and second mints.
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, 1))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer');
        const firstMintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterFirstMint: BigNumber = INITIAL_SUPPLY.add(1);
        await advanceTimeTo(mintingRestrictedBefore.add(1000).add(ONE_YEAR + 25));
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, 1))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer');
        const secondMintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterSecondMint: BigNumber = INITIAL_SUPPLY.add(1).add(1);

        // Mine some extra blocks, for the sake of testing the snapshot logic.
        for (let i = 0; i < 10; i++) {
          await dydxTokenWithDistributorSigner.transfer(executor.address, 0);
        }

        // Mint a third time.
        await advanceTimeTo(mintingRestrictedBefore.add(1000).add(ONE_YEAR * 2 + 50));
        await expect(dydxTokenWithGovernanceSigner.mint(executor.address, 1))
          .to.emit(dydxTokenWithGovernanceSigner, 'Transfer');
        const thirdMintBlockNumber = await getLatestMintBlockNumber(dydxToken);
        const supplyAfterThirdMint: BigNumber = INITIAL_SUPPLY.add(1).add(1).add(1);

        // Check total suppply.
        expect(await dydxToken.totalSupply()).to.equal(INITIAL_SUPPLY.add(3));

        // Check total supply snapshots.
        await expectTotalSupplySnapshotsCount(4);
        await expectTotalSupplySnapshot(0, tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalSupplySnapshot(1, firstMintBlockNumber, INITIAL_SUPPLY.add(1));
        await expectTotalSupplySnapshot(2, secondMintBlockNumber, INITIAL_SUPPLY.add(2));
        await expectTotalSupplySnapshot(3, thirdMintBlockNumber, INITIAL_SUPPLY.add(3));

        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(firstMintBlockNumber, supplyAfterFirstMint);
        await expectTotalVotingAndPropositionSupply(secondMintBlockNumber, supplyAfterSecondMint);
        await expectTotalVotingAndPropositionSupply(thirdMintBlockNumber, supplyAfterThirdMint);

        // blocks directly after mints should have the same supply
        await expectTotalVotingAndPropositionSupply(tokenDeployedBlockNumber + 1, INITIAL_SUPPLY);
        await expectTotalVotingAndPropositionSupply(firstMintBlockNumber + 1, supplyAfterFirstMint);
        await expectTotalVotingAndPropositionSupply(secondMintBlockNumber + 1, supplyAfterSecondMint);
        await expectTotalVotingAndPropositionSupply(thirdMintBlockNumber + 1, supplyAfterThirdMint);
      })
    });

    describe('addToTokenTransferAllowlist', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Non-owner addresses cannot add to transfer allowlist", async () => {
        await expect(dydxTokenWithNonOwnerSigner.addToTokenTransferAllowlist([testEnv.users[1].address])).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      })

      it("Governance can add to transfer allowlist", async () => {
        const userAddress: tEthereumAddress = testEnv.users[1].address;
        await expect(dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([userAddress]))
          .to
          .emit(dydxTokenWithGovernanceSigner, 'TransferAllowlistUpdated')
          .withArgs(userAddress, true);
      })

      it("Governance can add multiple addresses to transfer allowlist", async () => {
        const userAddress1: tEthereumAddress = testEnv.users[1].address;
        const userAddress2: tEthereumAddress = testEnv.users[2].address;
        await expect(dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([userAddress1, userAddress2]))
        .to
        .emit(dydxTokenWithGovernanceSigner, 'TransferAllowlistUpdated')
        .withArgs(userAddress1, true)
        .to
        .emit(dydxTokenWithGovernanceSigner, 'TransferAllowlistUpdated')
        .withArgs(userAddress2, true);
      })

      it("Adding addresses that already exist in transfer allowlist fails", async () => {
        const userAddress: tEthereumAddress = testEnv.users[1].address;
        await dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([userAddress]);

        await expect(dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([userAddress])).to.be.revertedWith(
          'ADDRESS_EXISTS_IN_TRANSFER_ALLOWLIST',
        );
      })
    });

    describe('removeFromTokenTransferAllowlist', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Non-owner addresses cannot remove from transfer allowlist", async () => {
        await expect(dydxTokenWithNonOwnerSigner.removeFromTokenTransferAllowlist([testEnv.users[1].address])).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      })

      it("Governance can remove from transfer allowlist", async () => {
        const userAddress: tEthereumAddress = testEnv.users[1].address;
        await dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([userAddress]);

        await expect(dydxTokenWithGovernanceSigner.removeFromTokenTransferAllowlist([userAddress]))
          .to
          .emit(dydxTokenWithGovernanceSigner, 'TransferAllowlistUpdated')
          .withArgs(userAddress, false);
      })

      it("Governance can remove multiple addresses to transfer allowlist", async () => {
        const userAddress1: tEthereumAddress = testEnv.users[1].address;
        const userAddress2: tEthereumAddress = testEnv.users[2].address;
        await dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([userAddress1, userAddress2]);

        await expect(dydxTokenWithGovernanceSigner.removeFromTokenTransferAllowlist([userAddress1, userAddress2]))
        .to
        .emit(dydxTokenWithGovernanceSigner, 'TransferAllowlistUpdated')
        .withArgs(userAddress1, false)
        .to
        .emit(dydxTokenWithGovernanceSigner, 'TransferAllowlistUpdated')
        .withArgs(userAddress2, false);
      })

      it("Removing addresses that don't exist in transfer allowlist fails", async () => {
        await expect(dydxTokenWithGovernanceSigner.removeFromTokenTransferAllowlist([testEnv.users[1].address])).to.be.revertedWith(
          'ADDRESS_DOES_NOT_EXIST_IN_TRANSFER_ALLOWLIST',
        );
      })
    });

    describe('updateTransfersRestrictedBefore', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Non-owner addresses cannot update transfersRestrictedBefore", async () => {
        await expect(dydxTokenWithNonOwnerSigner.updateTransfersRestrictedBefore(0)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      })

      it("Owner can update transfersRestrictedBefore", async () => {
        const newTransfersRestrictedBefore = transfersRestrictedBefore.add(ONE_DAY_BN.toString());

        await expect(dydxTokenWithGovernanceSigner.updateTransfersRestrictedBefore(newTransfersRestrictedBefore))
          .to
          .emit(dydxTokenWithGovernanceSigner, 'TransfersRestrictedBeforeUpdated')
          .withArgs(newTransfersRestrictedBefore);
      })

      it("Owner can update transfersRestrictedBefore to value of `TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN`", async () => {
        await expect(dydxTokenWithGovernanceSigner.updateTransfersRestrictedBefore(transferRestrictionLiftedNoLaterThan))
          .to
          .emit(dydxTokenWithGovernanceSigner, 'TransfersRestrictedBeforeUpdated')
          .withArgs(transferRestrictionLiftedNoLaterThan);
      })

      it("Owner cannot update transfersRestrictedBefore to after `TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN`", async () => {
        const afterMaxTransferRestriction: BigNumber = transferRestrictionLiftedNoLaterThan.add(1);
        await expect(dydxTokenWithGovernanceSigner.updateTransfersRestrictedBefore(afterMaxTransferRestriction)).to.be.revertedWith(
          'AFTER_MAX_TRANSFER_RESTRICTION',
        );
      })

      it("Owner cannot update transfersRestrictedBefore to an earlier value", async () => {
        const earlierTransfersRestrictedBefore: BigNumber = transfersRestrictedBefore.sub(1);
        await expect(dydxTokenWithGovernanceSigner.updateTransfersRestrictedBefore(earlierTransfersRestrictedBefore)).to.be.revertedWith(
          'NEW_TRANSFER_RESTRICTION_TOO_EARLY',
        );
      })

      it("Owner cannot update transfersRestrictedBefore after transfer restriction has ended", async () => {
        await advanceTimeTo(transfersRestrictedBefore);
        await expect(dydxTokenWithGovernanceSigner.updateTransfersRestrictedBefore(transferRestrictionLiftedNoLaterThan)).to.be.revertedWith(
          'TRANSFER_RESTRICTION_ENDED',
        );
      })
    });

    describe('transfer', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("Transfer isn't allowed if transfers aren't enabled and address isn't in transfer allowlist", async () => {
        await expect(dydxTokenWithNonOwnerSigner.transfer(testEnv.users[2].address, toWad(1))).to.be.revertedWith(
          'NON_ALLOWLIST_TRANSFERS_DISABLED',
        );
      })

      it("Transfer is allowed if transfers are enabled, even if address isn't in transfer allowlist", async () => {
        await advanceTimeTo(transfersRestrictedBefore);

        const amount: number = 5000;
        await expect(() => dydxTokenWithDistributorSigner.transfer(executor.address, amount))
          .to
          .changeTokenBalances(dydxTokenWithDistributorSigner, [distributor.signer, executor.signer], [-amount, amount]);
      })

      it("Transfer is allowed if transfers aren't enabled but receipient is in transfer allowlist", async () => {
        const user: SignerWithAddress = testEnv.users[1];
        await dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([user.address]);

        const amount: number = 1;
        await expect(() => dydxTokenWithDistributorSigner.transfer(user.address, amount))
          .to
          .changeTokenBalances(dydxTokenWithDistributorSigner, [distributor.signer, user.signer], [-amount, amount]);
      })

      it("Transfer is allowed if transfers aren't enabled but sender is in transfer allowlist", async () => {
        const amount: number = 777;
        await expect(() => dydxTokenWithDistributorSigner.transfer(testEnv.users[1].address, amount))
          .to
          .changeTokenBalances(dydxTokenWithDistributorSigner, [distributor.signer, testEnv.users[1].signer], [-amount, amount]);
      })
    });

    describe('transferFrom', () => {
      beforeEach(async () => {
        await revertTestChanges();
      })

      it("TransferFrom isn't allowed if transfers aren't enabled and address isn't in transfer allowlist", async () => {
        const amount: number = 999999999999;
        const txSender: SignerWithAddress = testEnv.users[1];
        const fundsSender: SignerWithAddress = testEnv.users[2];
        const recipient: SignerWithAddress = testEnv.users[3];

        await waitForTx(await dydxToken.transfer(fundsSender.address, amount));
        await approveForSender(fundsSender, txSender, recipient, amount);

        const dydxTokenWithSenderSigner = await getDydxTokenWithSigner(txSender.signer);

        await expect(dydxTokenWithSenderSigner.transferFrom(fundsSender.address, recipient.address, amount)).to.be.revertedWith(
          'NON_ALLOWLIST_TRANSFERS_DISABLED',
        );
      })

      it("TransferFrom is allowed if transfers are enabled, even if address isn't in transfer allowlist", async () => {
        await advanceTimeTo(transfersRestrictedBefore);

        const amount: number = 889999999999;

        const txSender: SignerWithAddress = testEnv.users[1];
        const fundsSender: SignerWithAddress = testEnv.users[2];
        const recipient: SignerWithAddress = testEnv.users[3];
        await waitForTx(await dydxToken.transfer(fundsSender.address, amount));
        await approveForSender(fundsSender, txSender, recipient, amount);

        const dydxTokenWithSenderSigner = await getDydxTokenWithSigner(txSender.signer);

        await expect(() => dydxTokenWithSenderSigner.transferFrom(fundsSender.address, recipient.address, amount))
          .to
          .changeTokenBalances(dydxTokenWithSenderSigner, [fundsSender.signer, recipient.signer], [-amount, amount]);
      })

      it("TransferFrom is allowed if transfers aren't enabled but recipient is in transfer allowlist", async () => {
        const amount: number = 889999999969;
        const txSender: SignerWithAddress = testEnv.users[1];
        const fundsSender: SignerWithAddress = testEnv.users[2];
        const recipient: SignerWithAddress = testEnv.users[3];

        await waitForTx(await dydxToken.transfer(fundsSender.address, amount));
        await approveForSender(fundsSender, txSender, recipient, amount);

        await dydxTokenWithGovernanceSigner.addToTokenTransferAllowlist([recipient.address]);

        const dydxTokenWithSenderSigner = await getDydxTokenWithSigner(txSender.signer);

        await expect(() => dydxTokenWithSenderSigner.transferFrom(fundsSender.address, recipient.address, amount))
          .to
          .changeTokenBalances(dydxTokenWithSenderSigner, [fundsSender.signer, recipient.signer], [-amount, amount]);
      })

      it("TransferFrom is allowed if transfers aren't enabled but sender is in transfer allowlist", async () => {
        const amount: number = 889999999969;
        const sender: SignerWithAddress = testEnv.users[1];
        const recipient: SignerWithAddress = testEnv.users[2];
        await approveForSender(distributor, sender, recipient, amount);

        const dydxTokenWithSenderSigner = await getDydxTokenWithSigner(sender.signer);

        await expect(() => dydxTokenWithSenderSigner.transferFrom(distributor.address, recipient.address, amount))
          .to
          .changeTokenBalances(dydxTokenWithSenderSigner, [distributor.signer, recipient.signer], [-amount, amount]);
      })
    });

    async function expectTotalSupplySnapshotsCount(
      expectedCount: number,
    ): Promise<void> {
      expect(await dydxToken._totalSupplySnapshotsCount()).to.equal(expectedCount);
      await expectTotalSupplySnapshot(expectedCount, 0, 0);
    }

    async function expectTotalSupplySnapshot(
      snapshotIndex: number,
      expectedBlockNumber: BigNumberish,
      expectedValue: BigNumberish
    ): Promise<void> {
      const snapshot = await dydxToken._totalSupplySnapshots(snapshotIndex);
      expect(snapshot.blockNumber).to.equal(expectedBlockNumber);
      expect(snapshot.value).to.equal(expectedValue);
    }

    async function expectTotalVotingAndPropositionSupply(
      expectedBlockNumber: BigNumberish,
      expectedSupply: BigNumberish
    ): Promise<void> {
      const [
        propositionSupplyAt,
        votingSupplyAt
      ]: [
        BigNumber,
        BigNumber,
      ] = await Promise.all([
        strategy.getTotalPropositionSupplyAt(expectedBlockNumber),
        strategy.getTotalVotingSupplyAt(expectedBlockNumber),
      ]);

      expect(propositionSupplyAt).to.equal(expectedSupply);
      expect(votingSupplyAt).to.equal(expectedSupply);
    }
})

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(afterTokenDeploy) || '1');
  snapshots.set(afterTokenDeploy, await evmSnapshot())
}

async function approveForSender(userWithTokens: SignerWithAddress, txSender: SignerWithAddress, recipient: SignerWithAddress, amount: number): Promise<void> {
  const dydxTokenWithDistributorSigner = await getDydxTokenWithSigner(userWithTokens.signer);
  await dydxTokenWithDistributorSigner.approve(txSender.address, amount);
}

async function advanceTimeTo(timestamp: BigNumber): Promise<void> {
  const latestBlockTimestamp = await timeLatest();
  const diff = timestamp.sub(latestBlockTimestamp.toString()).toNumber();
  await increaseTimeAndMine(diff);
}

async function getLatestMintBlockNumber(dydxToken: DydxToken): Promise<number> {
  const tokenMintFilter = dydxToken.filters.Transfer(ZERO_ADDRESS, null, null);
  const mintEvents: Event[] = await dydxToken.queryFilter(tokenMintFilter);
  return mintEvents[mintEvents.length - 1].blockNumber;
}
