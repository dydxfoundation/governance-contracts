# Treasury bridge deployment script setup

The following setup is required to run the hardhat deployment scripts:
1. Clone the repo and install dependencies with `npm install`.
1. Export an Alchemy API key to use in your current terminal session for the desired deployment network with `export ALCHEMY_KEY=<...>`.

# Deploying the Treasury Bridge contracts and proposal.

Note that two `TreasuryBridge.sol` contracts, one for the rewards treasury and one for the community treasury, should be deployed before
the governance proposal is created.

# Deploying the TreasuryBridge Contracts

To deploy the `TreasuryBridge.sol` contracts, you need to run the `deploy:treasury-bridge-contracts` task in the
`deploy-treasury-bridge-contracts.ts` script. 

After the deployment script setup, as an example these two contracts can be deployed on mainnet as follows. Note that hardhat accesses the deployment private key via the `MNEMONIC` environment variables. **IMPORTANT:** Using a `MNEMONIC` in this way is highly insecure. On mainnet, a temporary mnemonic or an entirely different method should be used.

```bash
MNEMONIC=<...> npx hardhat --network mainnet deploy:treasury-bridge-contracts
```

## Verifying the deployed Treasury Bridge Contracts

Perform the following steps to prepare for verifying the contracts, using the Ethereum mainnet network as an example.
1. Create an Etherscan API key by signing up for an Etherscan account, going to https://etherscan.io/myapikey and creating one.
1. Export the correct Etherscan API key for the network you deployed to. For example `export MAINNET_ETHERSCAN_API_KEY=<mainnet Etherscan API key>`.
1. Uncomment the correct environment variable from `hardhat.config.ts`, within the `hardhatConfig.etherscan.apiKey` key.
1. Copy the contract verification commands logged to stdout from the TreasuryBridge deployment scripts and run them with the correct Etherscan network (the default example logged to stdout is for mainnet).
