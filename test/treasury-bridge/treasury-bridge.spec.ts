import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';
import { COMMUNITY_TREASURY_VESTER_BURN_ADDRESS, DIP_29_IPFS_HASH, REWARDS_TREASURY_VESTER_BURN_ADDRESS } from '../../src/lib/constants';
import { latestBlockTimestamp } from '../helpers/evm';
import { TreasuryBridge__factory } from '../../types';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { getDeployConfig } from '../../src/deploy-config';
import { toWad } from '../../src/lib/util';
function init() { }

describeContract('treasury-bridge', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is set correctly', async () => {
    const treasuryBridgeProposalId = 16;
    const proposal = await ctx.governor.getProposalById(treasuryBridgeProposalId);
    const numProposals = await ctx.governor.getProposalsCount();

    // Verify that the number of proposals is correct and the IPFS hash is set correctly on the proposal.
    expect(numProposals).to.equal(17);
    expect(proposal.ipfsHash).to.equal(DIP_29_IPFS_HASH);
  });

  it('The implementation is set to the treasury bridge implementation', async () => {
    const rewardsTreasuryImplementationAddress = await ctx.rewardsTreasuryProxyAdmin.getProxyImplementation(
      ctx.rewardsTreasury.address,
    );
    const communityTreasuryImplementationAddress = await ctx.communityTreasuryProxyAdmin.getProxyImplementation(
      ctx.communityTreasury.address,
    );
    expect(rewardsTreasuryImplementationAddress).to.equal(ctx.rewardsTreasuryBridge.address);
    expect(communityTreasuryImplementationAddress).to.equal(ctx.communityTreasuryBridge.address);
  });

  it('New rewards and community treasuries have the correct owner, treasury vester, bridge, and burn address set', async () => {
    const rewardsTreasuryBridge = new TreasuryBridge__factory(ctx.deployer).attach(ctx.rewardsTreasury.address);
    const communityTreasuryBridge = new TreasuryBridge__factory(ctx.deployer).attach(ctx.communityTreasury.address);
    const rewardsTreasuryBridgeVesterAddress = await rewardsTreasuryBridge.TREASURY_VESTER();
    const communityTreasuryBridgeVesterAddress = await communityTreasuryBridge.TREASURY_VESTER();
    expect(rewardsTreasuryBridgeVesterAddress).to.equal('0xb9431E19B29B952d9358025f680077C3Fd37292f');
    expect(communityTreasuryBridgeVesterAddress).to.equal('0x08a90Fe0741B7DeF03fB290cc7B273F1855767D8');

    const rewardsTreasuryBridgeBridgeAddress = await rewardsTreasuryBridge.BRIDGE();
    const communityTreasuryBridgeBridgeAddress = await communityTreasuryBridge.BRIDGE();

    const wrappedDydxTokenAddress = '0x46b2DeAe6eFf3011008EA27EA36b7c27255ddFA9';
    expect(rewardsTreasuryBridgeBridgeAddress).to.equal(wrappedDydxTokenAddress);
    expect(communityTreasuryBridgeBridgeAddress).to.equal(wrappedDydxTokenAddress);

    const rewardsTreasuryBridgeBurnAddress = await rewardsTreasuryBridge.BURN_ADDRESS();
    const communityTreasuryBridgeBurnAddress = await communityTreasuryBridge.BURN_ADDRESS();
    expect(rewardsTreasuryBridgeBurnAddress).to.equal(REWARDS_TREASURY_VESTER_BURN_ADDRESS);
    expect(communityTreasuryBridgeBurnAddress).to.equal(COMMUNITY_TREASURY_VESTER_BURN_ADDRESS);

    const rewardsTreasuryOwner = await rewardsTreasuryBridge.owner();
    const communityTreasuryOwner = await communityTreasuryBridge.owner();
    expect(rewardsTreasuryOwner).to.equal(ctx.shortTimelock.address);
    expect(communityTreasuryOwner).to.equal(ctx.shortTimelock.address);
  });

  it('Rewards and community treasury vesters just vested rewards and are now vesting to the burn address', async () => {
    const rewardsTreasuryVesterRecipientAddress = await ctx.rewardsTreasuryVester.recipient();
    const communityTreasuryVesterRecipientAddress = await ctx.communityTreasuryVester.recipient();
    expect(rewardsTreasuryVesterRecipientAddress).to.equal(REWARDS_TREASURY_VESTER_BURN_ADDRESS);
    expect(communityTreasuryVesterRecipientAddress).to.equal(COMMUNITY_TREASURY_VESTER_BURN_ADDRESS);

    const rewardsTreasuryVesterLastUpdate = await ctx.rewardsTreasuryVester.lastUpdate();
    const communityTreasuryVesterLastUpdate = await ctx.communityTreasuryVester.lastUpdate();
    const lastTimestamp = await latestBlockTimestamp();
    expect(rewardsTreasuryVesterLastUpdate.toNumber()).to.be.lessThanOrEqual(lastTimestamp);
    expect(communityTreasuryVesterLastUpdate.toNumber()).to.be.lessThanOrEqual(lastTimestamp);
  });

  it('Non-owners of the rewards and community treasury bridge cannot bridge funds and approvals are 0', async () => {
    // Verify that non-owners cannot bridge the rewards and community treasuries.
    const rewardsTreasuryBridge = new TreasuryBridge__factory(ctx.deployer).attach(ctx.rewardsTreasury.address);
    const rewardsTreasuryBalance = await ctx.dydxToken.balanceOf(ctx.rewardsTreasury.address);
    const communityTreasuryBridge = new TreasuryBridge__factory(ctx.deployer).attach(ctx.communityTreasury.address);
    const communityTreasuryBalance = await ctx.dydxToken.balanceOf(ctx.communityTreasury.address);
    await expect(
        rewardsTreasuryBridge.bridgeTreasury(rewardsTreasuryBalance, ethers.Wallet.createRandom().address, '0x00')
    ).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(
        communityTreasuryBridge.bridgeTreasury(communityTreasuryBalance, ethers.Wallet.createRandom().address, '0x00')
    ).to.be.revertedWith('Ownable: caller is not the owner');

    // Verify that wrapped Ethereum DYDX token bridge is not approved to pull funds from the treasuries.
    const rewardsTreasuryAllowance = await ctx.dydxToken.allowance(ctx.rewardsTreasury.address, ctx.wrappedDydxToken.address);
    const communityTreasuryAllowance = await ctx.dydxToken.allowance(ctx.communityTreasury.address, ctx.wrappedDydxToken.address);
    expect(rewardsTreasuryAllowance).to.equal(0);
    expect(communityTreasuryAllowance).to.equal(0);
  });

  it('The rewards and community treasury contracts cannot be re-initialized', async () => {
    const rewardsTreasuryBridge = new TreasuryBridge__factory(ctx.deployer).attach(ctx.rewardsTreasury.address);
    const communityTreasuryBridge = new TreasuryBridge__factory(ctx.deployer).attach(ctx.communityTreasury.address);

    await expect(rewardsTreasuryBridge.initialize()).to.be.revertedWith('Contract instance has already been initialized');
    await expect(communityTreasuryBridge.initialize()).to.be.revertedWith('Contract instance has already been initialized');
  });

  it('Funds were bridged from the rewards and community treasuries', async () => {
    // Verify that the last events emitted from the wrapped DYDX token contract were events for bridging funds
    // from the rewards and community treasuries to the burn address.
    const nextAvailableBridgeId = await ctx.wrappedDydxToken._nextAvailableBridgeId();
    const rewardsTreasuryBridgeEventId = nextAvailableBridgeId.sub(2);
    const communityTreasuryBridgeEventId = nextAvailableBridgeId.sub(1);
    const rewardsTreasuryFilter = ctx.wrappedDydxToken.filters.Bridge(rewardsTreasuryBridgeEventId, null, null, null);
    const communityTreasuryFilter = ctx.wrappedDydxToken.filters.Bridge(communityTreasuryBridgeEventId, null, null, null);
    const rewardsTreasuryEvents = await ctx.wrappedDydxToken.queryFilter(rewardsTreasuryFilter);
    const communityTreasuryEvents = await ctx.wrappedDydxToken.queryFilter(communityTreasuryFilter);
    expect(rewardsTreasuryEvents.length).to.equal(1);
    expect(communityTreasuryEvents.length).to.equal(1);

    const deployConfig = getDeployConfig();

    // This constant was created from providing the community treasury DYDX chain address to this script:
    // https://github.com/dydxprotocol/v4-chain/blob/dd16df68edc64eb08008ab296beb07163f2da076/protocol/scripts/bech32_to_hex/bech32_to_hex.go
    const dydxChainCommunityTreasuryAddressBytes = '0xa0978f189552e6ae5ad87824bbdb98717b8d4428';

    expect(rewardsTreasuryEvents[0].args.id).to.equal(rewardsTreasuryBridgeEventId);
    expect(rewardsTreasuryEvents[0].args.from).to.equal(ctx.rewardsTreasury.address);
    expect(rewardsTreasuryEvents[0].args.accAddress).to.equal(dydxChainCommunityTreasuryAddressBytes);
    expect(rewardsTreasuryEvents[0].args.data).to.equal('0x');

    expect(communityTreasuryEvents[0].args.id).to.equal(communityTreasuryBridgeEventId);
    expect(communityTreasuryEvents[0].args.amount.toString()).not.equal('0');
    expect(communityTreasuryEvents[0].args.from).to.equal(ctx.communityTreasury.address);
    expect(communityTreasuryEvents[0].args.accAddress).to.equal(dydxChainCommunityTreasuryAddressBytes);
    expect(communityTreasuryEvents[0].args.data).to.equal('0x');

    // Query the rewards treasury dydx token balance and verify it's greater than 0.
    const rewardsTreasuryDydxTokenBalance = await ctx.dydxToken.balanceOf(ctx.rewardsTreasury.address);
    expect(rewardsTreasuryDydxTokenBalance).to.be.gt(0);

    // There shouldn't be more funds bridged than the unallocated rewards.
    const rewardsTreasuryBridgedAmount = rewardsTreasuryEvents[0].args.amount;
    const rewardsTreasuryVesterBridgedAmount = await ctx.dydxToken.balanceOf(ctx.rewardsTreasuryVester.address);
    const rewardsTreasuryTotalBridged = rewardsTreasuryBridgedAmount.add(rewardsTreasuryVesterBridgedAmount);
    expect(
      parseFloat(
        ethers.utils.formatUnits(rewardsTreasuryTotalBridged),
      ),
    ).to.be.lessThanOrEqual(
      parseFloat(
        deployConfig.UNALLOCATED_REWARDS_TO_BRIDGE_AMOUNT,
      ),
    );

    // Theres hould be less than 5k DYDX tokens of dust left in the rewards treasury.
    // Note the test setup assumes blocks are mined every 12.05 seconds.
    const rewardsTreasuryDust = BigNumber.from(deployConfig.UNALLOCATED_REWARDS_TO_BRIDGE_AMOUNT).sub(
      rewardsTreasuryTotalBridged,
    );
    expect(rewardsTreasuryDust).to.be.lt(BigNumber.from(toWad('5000')))

    // Query the community treasury dydx token balance and verify it's less than 5000 tokens (note it won't be zero
    // due to unpredictability around what timestamp the proposal is executed at).
    const communityTreasuryDydxTokenBalance = await ctx.dydxToken.balanceOf(ctx.communityTreasury.address);
    const communityTreasuryDydxTokenBalanceHumanReadable = ethers.utils.formatUnits(communityTreasuryDydxTokenBalance);
    expect(parseFloat(communityTreasuryDydxTokenBalanceHumanReadable)).to.be.lessThan(5000);

    // Query the rewards and community treasury wrapped dydx token balance and verify it's equal to
    // the bridged amount in the event.
    const rewardsTreasuryWrappedDydxTokenBalance = await ctx.wrappedDydxToken.balanceOf(ctx.rewardsTreasury.address);
    const communityTreasuryWrappedDydxTokenBalance = await ctx.wrappedDydxToken.balanceOf(ctx.communityTreasury.address);
    expect(rewardsTreasuryWrappedDydxTokenBalance).to.equal(rewardsTreasuryEvents[0].args.amount);
    expect(communityTreasuryWrappedDydxTokenBalance).to.equal(communityTreasuryEvents[0].args.amount);
  });
});
