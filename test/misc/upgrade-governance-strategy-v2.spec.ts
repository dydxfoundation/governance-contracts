import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { waitForTx } from '../../src/lib/util';
import { ethers } from 'hardhat';
import { DelegationType } from '../../src';
import { DIP_26_IPFS_HASH } from '../../src/lib/constants';

function init() { }

describeContract('upgrade-governance-strategy-v2', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is set correctly', async () => {
    const upgradeGovernanceStrategyV2ProposalId = 15;
    const proposal = await ctx.governor.getProposalById(upgradeGovernanceStrategyV2ProposalId);
    const numProposals = await ctx.governor.getProposalsCount();

    // Verify that the number of proposals is correct and the IPFS hash is set correctly on the proposal.
    expect(numProposals).to.equal(16);
    expect(proposal.ipfsHash).to.equal(DIP_26_IPFS_HASH);
  });

  it('New governance strategy is set on DYDX governor, has correct token addresses and supply', async () => {
    const dydxTokenAddress = await ctx.governanceStrategyV2.DYDX_TOKEN();
    const stakedDydxTokenAddress = await ctx.governanceStrategyV2.STAKED_DYDX_TOKEN();
    const wrappedEthereumDydxTokenAddress = await ctx.governanceStrategyV2.WRAPPED_ETHEREUM_DYDX_TOKEN();

    expect(dydxTokenAddress).to.equal('0x92D6C1e31e14520e676a687F0a93788B716BEff5');
    expect(stakedDydxTokenAddress).to.equal('0x65f7BA4Ec257AF7c55fd5854E5f6356bBd0fb8EC');
    expect(wrappedEthereumDydxTokenAddress).to.equal(ctx.wrappedDydxToken.address);

    const currentBlock = await ethers.provider.getBlockNumber();
    const totalPropositionSupply = await ctx.governanceStrategyV2.getTotalPropositionSupplyAt(currentBlock);
    const totalVotingSupply = await ctx.governanceStrategyV2.getTotalVotingSupplyAt(currentBlock);
    const expectedSupply = ethers.utils.parseEther('1000000000'); // 1B * 10^18

    expect(totalPropositionSupply).to.equal(expectedSupply);
    expect(totalVotingSupply).to.equal(expectedSupply);

    const dydxGovernorStrategy = await ctx.governor.getGovernanceStrategy();
    expect(dydxGovernorStrategy).to.equal(ctx.governanceStrategyV2.address);
  });

  it('New governance strategy still counts voting power from DYDX and staked DYDX tokens', async () => {
    // Address with non-zero balances of DYDX and staked DYDX tokens that has not delegated
    // their voting power.
    const addressWithDydxAndStakedDydx = '0xE2d14c74f2996B5f1cE757e9Aae129C1c3Da4eeb';
    const dydxTokenBalance = await ctx.dydxToken.balanceOf(addressWithDydxAndStakedDydx);
    const stakedDydxTokenBalance = await ctx.safetyModule.balanceOf(addressWithDydxAndStakedDydx);

    expect(dydxTokenBalance).to.be.gt(0);
    expect(stakedDydxTokenBalance).to.be.gt(0);

    const currentBlock = await ethers.provider.getBlockNumber();
    const dydxVotingPower = await ctx.dydxToken.getPowerAtBlock(addressWithDydxAndStakedDydx, currentBlock, DelegationType.VOTING_POWER);
    const stakedDydxVotingPower = await ctx.safetyModule.getPowerAtBlock(addressWithDydxAndStakedDydx, currentBlock, DelegationType.VOTING_POWER);

    const dydxPropositionPower = await ctx.dydxToken.getPowerAtBlock(addressWithDydxAndStakedDydx, currentBlock, DelegationType.PROPOSITION_POWER);
    const stakedDydxPropositionPower = await ctx.safetyModule.getPowerAtBlock(addressWithDydxAndStakedDydx, currentBlock, DelegationType.PROPOSITION_POWER);

    const totalVotingPower = await ctx.governanceStrategyV2.getVotingPowerAt(addressWithDydxAndStakedDydx, currentBlock);
    const totalPropositionPower = await ctx.governanceStrategyV2.getPropositionPowerAt(addressWithDydxAndStakedDydx, currentBlock);

    expect(dydxVotingPower.add(stakedDydxVotingPower)).to.equal(totalVotingPower);
    expect(dydxPropositionPower.add(stakedDydxPropositionPower)).to.equal(totalPropositionPower);
  });

  it('Wrapped DYDX token has correct DYDX token address, name, symbol, and decimals', async () => {
    const dydxTokenAddress = await ctx.wrappedDydxToken.DYDX_TOKEN();
    const tokenName = await ctx.wrappedDydxToken.name();
    const tokenSymbol = await ctx.wrappedDydxToken.symbol();
    const tokenDecimals = await ctx.wrappedDydxToken.decimals();

    expect(dydxTokenAddress).to.equal('0x92D6C1e31e14520e676a687F0a93788B716BEff5');
    expect(tokenName).to.equal('Wrapped Ethereum DYDX');
    expect(tokenSymbol).to.equal('wethDYDX');
    expect(tokenDecimals).to.equal(18);
  });

  it('Bridging fails if DYDX tokens are not approved or more than DYDX token balance', async () => {
    const addressWithDydx = '0xE2d14c74f2996B5f1cE757e9Aae129C1c3Da4eeb'; // Address with non-zero balances of DYDX tokens
    const dydxTokenBalance = await ctx.dydxToken.balanceOf(addressWithDydx);
    const wrappedEthereumDydxToken = ctx.wrappedDydxToken.connect(addressWithDydx);

    // Approve the WrappedEthereumDydxToken contract to spend less DYDX tokens than the balance
    await waitForTx(
        await ctx.dydxToken.approve(ctx.wrappedDydxToken.address, dydxTokenBalance.sub(1)),
    );

    // Try to bridge more tokens than approved, expect it to fail
    await expect(
        wrappedEthereumDydxToken.bridge(dydxTokenBalance, ethers.Wallet.createRandom().address, '0x00')
    ).to.be.revertedWith('SafeERC20: low-level call failed');

    // Approve the WrappedEthereumDydxToken contract to spend all DYDX tokens
    await waitForTx(
        await ctx.dydxToken.approve(ctx.wrappedDydxToken.address, dydxTokenBalance),
    );

    // Try to bridge more tokens than the balance, expect it to fail
    await expect(
        wrappedEthereumDydxToken.bridge(dydxTokenBalance.add(1), ethers.Wallet.createRandom().address, '0x00')
    ).to.be.revertedWith('SafeERC20: low-level call failed');
  });

  it('Wrapped DYDX retains voting and proposition power and can be delegated after bridging and transfers', async () => {
    const wrappedEthereumDydxTokenAddress = ctx.wrappedDydxToken.address;

    // List of addresses with non-zero balances of DYDX tokens that have not delegated
    // their voting power.
    const addressesToImpersonate = [
        '0x2f13d388b85e0eCd32e7C3D7F36D1053354EF104',
        '0x9D825C29495290f4104b3D199f47f47A8A810642',
        '0x543a5aED5abC902553A92547701Ac38F73A70785',
    ];

    let expectedNextAvailableBridgeId = ethers.BigNumber.from(0);
    let allAddressTotalBridged = ethers.BigNumber.from(0);
    for (const addressToImpersonate of addressesToImpersonate) {
        // Impersonate and fund the account
        const impersonatedSigner = await impersonateAndFundAccount(addressToImpersonate);

        // Create contract instances
        const dydxToken = ctx.dydxToken.connect(impersonatedSigner);
        const wrappedEthereumDydxToken = ctx.wrappedDydxToken.connect(impersonatedSigner);
        const governanceStrategyV2 = ctx.governanceStrategyV2.connect(impersonatedSigner);

        const oldBlockNumber = await ethers.provider.getBlockNumber();
        const originalVotingPower = await governanceStrategyV2.getVotingPowerAt(
            addressToImpersonate,
            oldBlockNumber,
        );
        const originalPropPower = await governanceStrategyV2.getPropositionPowerAt(
            addressToImpersonate,
            oldBlockNumber,
        );

        // Define the amount to bridge by getting the DYDX token balance of the impersonated address.
        const dydxTokenBalance = await dydxToken.balanceOf(addressToImpersonate);

        // Verify the DYDX token balance, voting power, and proposition power are all equal and greater than zero.
        expect(dydxTokenBalance).to.be.gt(0);
        expect(dydxTokenBalance).to.equal(originalVotingPower);
        expect(dydxTokenBalance).to.equal(originalPropPower);

        // Approve the WrappedEthereumDydxToken contract to spend DYDX tokens
        await waitForTx(
            await dydxToken.approve(wrappedEthereumDydxTokenAddress, dydxTokenBalance),
        );

        // Verify the wrapped DYDX token voting power and proposition power is 0 before bridging.
        const preBridgingBlock = await ethers.provider.getBlockNumber();
        const wrappedDydxVotingPower = await ctx.wrappedDydxToken.getPowerAtBlock(addressToImpersonate, preBridgingBlock, DelegationType.VOTING_POWER);
        const wrappedDydxPropPower = await ctx.wrappedDydxToken.getPowerAtBlock(addressToImpersonate, preBridgingBlock, DelegationType.PROPOSITION_POWER);
        expect(wrappedDydxVotingPower).to.equal(0);
        expect(wrappedDydxPropPower).to.equal(0);

        // Perform 10 bridging transactions.
        const iterations = 10;
        let currentAddressTotalBridged = ethers.BigNumber.from(0);
        for (let i = 0; i < iterations; i++) {
            // Update destChainAddress and memo on each iteration
            const randomAddress: string = ethers.Wallet.createRandom().address.toLowerCase();
            const memo = '0x' + i.toString().padStart(2, '0');

            // Before bridging verify the next available bridge ID equals the expected next available bridge ID,
            // and then increment the next expected available bridge ID by 1.
            const currentNextAvailableBridgeId = await wrappedEthereumDydxToken._nextAvailableBridgeId();
            expect(currentNextAvailableBridgeId).to.equal(expectedNextAvailableBridgeId);
            expectedNextAvailableBridgeId = expectedNextAvailableBridgeId.add(1);

            // Bridge 1 / iterations of the total DYDX token balance each time and verify the Bridge event
            // is emitted with the correct parameters. Note to avoid rounding error, bridge total remaining
            // balance on the last iteration.
            let portionDydxTokenBalance;
            if (i < iterations - 1) {
                portionDydxTokenBalance = dydxTokenBalance.div(iterations);
            } else {
                portionDydxTokenBalance = dydxTokenBalance.sub(currentAddressTotalBridged);
            }

            const bridgeTx = await wrappedEthereumDydxToken.bridge(
                portionDydxTokenBalance,
                randomAddress,
                memo,
            );
            currentAddressTotalBridged = currentAddressTotalBridged.add(portionDydxTokenBalance);

            await expect(bridgeTx)
                .to.emit(wrappedEthereumDydxToken, 'Bridge')
                .withArgs(
                    ethers.BigNumber.from(expectedNextAvailableBridgeId.sub(1)), // id
                    portionDydxTokenBalance, // amount
                    addressToImpersonate, // from
                    randomAddress, // accAddress
                    memo, // memo
                );

            // Verify total voting power and proposition power didn't change and the wrapped DYDX token
            // balance is the same as the dydxTokenBalance was before bridging.
            const currBlock = await ethers.provider.getBlockNumber();
            const wrappedDydxTokenBalance = await wrappedEthereumDydxToken.balanceOf(addressToImpersonate);
            const newVotingPower = await governanceStrategyV2.getVotingPowerAt(addressToImpersonate, currBlock);
            const newPropPower = await governanceStrategyV2.getPropositionPowerAt(addressToImpersonate, currBlock);
            expect(wrappedDydxTokenBalance).to.equal(currentAddressTotalBridged);
            expect(newVotingPower).to.equal(originalVotingPower);
            expect(newPropPower).to.equal(originalPropPower);

            // Verify the DYDX token voting power and proposition power is equal to their current DYDX token balance at current block.
            const currentDydxTokenBalance = dydxTokenBalance.sub(currentAddressTotalBridged);
            const dydxVotingPower = await ctx.dydxToken.getPowerAtBlock(addressToImpersonate, currBlock, DelegationType.VOTING_POWER);
            const dydxPropPower = await ctx.dydxToken.getPowerAtBlock(addressToImpersonate, currBlock, DelegationType.PROPOSITION_POWER);
            expect(dydxVotingPower).to.equal(currentDydxTokenBalance);
            expect(dydxPropPower).to.equal(currentDydxTokenBalance);

            // Verify the wrapped DYDX token voting power and proposition power is equal to their current wrapped DYDX token balance at current block.
            const wrappedDydxVotingPower = await ctx.wrappedDydxToken.getPowerAtBlock(addressToImpersonate, currBlock, DelegationType.VOTING_POWER);
            const wrappedDydxPropPower = await ctx.wrappedDydxToken.getPowerAtBlock(addressToImpersonate, currBlock, DelegationType.PROPOSITION_POWER);
            expect(wrappedDydxVotingPower).to.equal(wrappedDydxTokenBalance);
            expect(wrappedDydxPropPower).to.equal(wrappedDydxTokenBalance);

            // Verify the wrappedDydxToken contract balance of DYDX tokens is increasing by the bridged amount.
            const wrappedDydxTokenContractBalance = await dydxToken.balanceOf(wrappedEthereumDydxTokenAddress);
            expect(wrappedDydxTokenContractBalance).to.equal(allAddressTotalBridged.add(currentAddressTotalBridged));
        }

        // Update the total amount bridged.
        allAddressTotalBridged = allAddressTotalBridged.add(currentAddressTotalBridged);

        // After all bridging has completed, verify the next available bridge ID equals the number of iterations.
        const newNextAvailableBridgeId = await wrappedEthereumDydxToken._nextAvailableBridgeId();
        expect(newNextAvailableBridgeId).to.equal(expectedNextAvailableBridgeId);

        // Verify the wrapped DYDX token voting power and proposition power is still 0 when
        // checking the block before bridging.
        const wrappedDydxVotingPower2 = await ctx.wrappedDydxToken.getPowerAtBlock(addressToImpersonate, preBridgingBlock, DelegationType.VOTING_POWER);
        const wrappedDydxPropPower2 = await ctx.wrappedDydxToken.getPowerAtBlock(addressToImpersonate, preBridgingBlock, DelegationType.PROPOSITION_POWER);
        expect(wrappedDydxVotingPower2).to.equal(0);
        expect(wrappedDydxPropPower2).to.equal(0);

        // Create a new user for delegation and another for transfer
        const delegationUser: string = ethers.Wallet.createRandom().address;
        const transferUser: string = ethers.Wallet.createRandom().address;

        // Delegate voting and proposition power to the delegationUser
        await waitForTx(
            await wrappedEthereumDydxToken.delegateByType(delegationUser, DelegationType.VOTING_POWER),
        );
        await waitForTx(
            await wrappedEthereumDydxToken.delegateByType(delegationUser, DelegationType.PROPOSITION_POWER),
        );

        // Verify the voting power and proposition power of delegationUser are equal to the original powers
        const postDelegationBlock = await ethers.provider.getBlockNumber();
        const delegationUserVotingPower = await governanceStrategyV2.getVotingPowerAt(delegationUser, postDelegationBlock);
        const delegationUserPropPower = await governanceStrategyV2.getPropositionPowerAt(delegationUser, postDelegationBlock);
        expect(delegationUserVotingPower).to.equal(originalVotingPower);
        expect(delegationUserPropPower).to.equal(originalPropPower);

        // Transfer all wrapped DYDX tokens from addressToImpersonate to transferUser. 
        await waitForTx(
            await wrappedEthereumDydxToken.transfer(transferUser, dydxTokenBalance),
        );

        // Check the voting power proposition power, and token balance of addressToImpersonate and
        // verify it's zero.
        const postTransferBlock = await ethers.provider.getBlockNumber();
        const postTransferVotingPower = await governanceStrategyV2.getVotingPowerAt(addressToImpersonate, postTransferBlock);
        const postTransferPropPower = await governanceStrategyV2.getPropositionPowerAt(addressToImpersonate, postTransferBlock);
        const postTransferWrappedDydxTokenBalance = await wrappedEthereumDydxToken.balanceOf(addressToImpersonate);
        expect(postTransferVotingPower).to.equal(0);
        expect(postTransferPropPower).to.equal(0);
        expect(postTransferWrappedDydxTokenBalance).to.equal(0);

        // Check the voting power, proposition power and wrapped DYDX token balance of transferUser and verify
        // they're equal to original powers and balance.
        const transferUserVotingPowerAfterTransfer = await governanceStrategyV2.getVotingPowerAt(transferUser, postTransferBlock);
        const transferUserPropPowerAfterTransfer = await governanceStrategyV2.getPropositionPowerAt(transferUser, postTransferBlock);
        const transferUserWrappedDydxTokenBalance = await wrappedEthereumDydxToken.balanceOf(transferUser);
        expect(transferUserVotingPowerAfterTransfer).to.equal(originalVotingPower);
        expect(transferUserPropPowerAfterTransfer).to.equal(originalPropPower);
        expect(transferUserWrappedDydxTokenBalance).to.equal(dydxTokenBalance);

        // Verify the voting power and proposition power of delegationUser is zero after transfer
        const delegationUserVotingPowerAfterTransfer = await governanceStrategyV2.getVotingPowerAt(delegationUser, postTransferBlock);
        const delegationUserPropPowerAfterTransfer = await governanceStrategyV2.getPropositionPowerAt(delegationUser, postTransferBlock);
        expect(delegationUserVotingPowerAfterTransfer).to.equal(0);
        expect(delegationUserPropPowerAfterTransfer).to.equal(0);
    }
  });
});
