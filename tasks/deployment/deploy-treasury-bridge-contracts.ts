import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { deployTreasuryBridgeContracts } from '../../src/migrations/deploy-treasury-bridge-contracts';
import { log } from '../../src/lib/logging';
import { COMMUNITY_TREASURY_VESTER_BURN_ADDRESS, REWARDS_TREASURY_VESTER_BURN_ADDRESS } from '../../src/lib/constants';

hardhatTask('deploy:treasury-bridge-contracts', 'Deploy treasury bridge contracts.')
  .addParam('wrappedDydxTokenAddress', 'Address of the deployed WrappedDydxToken contract', mainnetAddresses.wrappedEthereumDydxToken, types.string)
  .addParam('rewardsTreasuryVesterAddress', 'Address of the deployed rewards treasury vester contract', mainnetAddresses.rewardsTreasuryVester, types.string)
  .addParam('communityTreasuryVesterAddress', 'Address of the deployed community treasury vester contract', mainnetAddresses.communityTreasuryVester, types.string)
  .setAction(async (args: {
    wrappedDydxTokenAddress: string,
    rewardsTreasuryVesterAddress: string,
    communityTreasuryVesterAddress: string,
  }) => {
    const {
        rewardsTreasuryBridge,
        communityTreasuryBridge,
    } = await deployTreasuryBridgeContracts({
        wrappedDydxTokenAddress: args.wrappedDydxTokenAddress,
        rewardsTreasuryVesterAddress: args.rewardsTreasuryVesterAddress,
        communityTreasuryVesterAddress: args.communityTreasuryVesterAddress,
    });
    // Log out the contract addresses.
    log(`New Rewards Treasury Bridge Contract deployed to: ${rewardsTreasuryBridge.address}`);
    log(`New Community Treasury Bridge Contract deployed to: ${communityTreasuryBridge.address}`);

    // Log out instructions to verify the contracts on the desired network.
    log("Perform the following steps to verify the deployed contracts on Etherscan:");
    log("1. Follow all Etherscan verification setup instructions from contracts/treasury/README.md under the `Verifying the deployed Treasury Bridge Contracts` section.");
    log("2. Run the following command to verify the rewards Treasury Bridge Contract (using mainnet as an example):\n");
    log(`npx hardhat verify --network mainnet ${rewardsTreasuryBridge.address} "${args.rewardsTreasuryVesterAddress}" "${args.wrappedDydxTokenAddress}" "${REWARDS_TREASURY_VESTER_BURN_ADDRESS}"`);
    log("3. Run the following command to verify the community Treasury Bridge Contract (using mainnet as an example):\n");
    log(`npx hardhat verify --network mainnet ${communityTreasuryBridge.address} "${args.communityTreasuryVesterAddress}" "${args.wrappedDydxTokenAddress}" "${COMMUNITY_TREASURY_VESTER_BURN_ADDRESS}"`);
  });
