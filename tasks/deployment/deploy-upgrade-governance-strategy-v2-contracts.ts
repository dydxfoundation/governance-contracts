import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { log } from '../../src/lib/logging';
import { deployUpgradeGovernanceStrategyV2Contracts } from '../../src/migrations/deploy-upgrade-governance-strategy-v2-contracts';

hardhatTask('deploy:upgrade-governance-strategy-v2-contracts', 'Deploy bridge contract and governance strategy V2 contract.')
  .addParam('dydxTokenAddress', 'Address of the deployed DydxToken contract', mainnetAddresses.dydxToken, types.string)
  .addParam('safetyModuleAddress', 'Address of the deployed safety module contract (staked DYDX token)', mainnetAddresses.safetyModule, types.string)
  .setAction(async (args: {
    dydxTokenAddress: string,
    safetyModuleAddress: string,
  }) => {
    const {
        wrappedDydxToken,
        governanceStrategyV2,
    } = await deployUpgradeGovernanceStrategyV2Contracts({
        dydxTokenAddress: args.dydxTokenAddress,
        safetyModuleAddress: args.safetyModuleAddress,
    });
    // Log out the contract addresses.
    log(`New Ethereum Wrapped Dydx Token Contract deployed to: ${wrappedDydxToken.address}`);
    log(`New Governance Strategy V2 contract deployed to: ${governanceStrategyV2.address}`);

    // Log out instructions to verify the contracts on the desired network.
    log("Perform the following steps to verify the deployed contracts on Etherscan:");
    log("1. Follow all Etherscan verification setup instructions from contracts/governance/strategy/README.md under the `Verifying the deployed GovernanceStrategyV2 and WrappedEthereumDydxToken Contracts` section.");
    log("2. Run the following command to verify the Ethereum Wrapped Dydx Token Contract (using mainnet as an example):\n");
    log(`npx hardhat verify --network mainnet ${wrappedDydxToken.address} "${args.dydxTokenAddress}"`);
    log("\n3. Run the following command with a network and Etherscan API key to verify the Governance Strategy V2 Contract (using mainnet as an example):\n");
    log(`npx hardhat verify --network mainnet ${governanceStrategyV2.address} "${args.dydxTokenAddress}" "${args.safetyModuleAddress}" "${wrappedDydxToken.address}"`);

    log("\nUsing mainnet as an example, run the following command to get the upgrade governance strategy V2 proposal creation calldata:");
    log(`npx hardhat --network mainnet upgrade-governance-strategy-v2-proposal --governance-strategy-v2-address ${governanceStrategyV2.address}`);
  });
