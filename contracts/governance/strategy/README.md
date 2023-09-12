# Upgrade governance strategy V2 contracts deployment script setup

The following setup is required to run the hardhat deployment scripts:
1. Clone the repo and install dependencies with `npm install`.
1. Export an Alchemy API key to use in your current terminal session for the desired deployment network with `export ALCHEMY_KEY=<...>`.

# Deploying the upgrade governance strategy V2 contracts and proposal.

Note the `GovernanceStrategyV2.sol` and `WrappedEthereumDydxToken.sol` contracts should be deployed before the governance proposal is created.

# Deploying the GovernanceStrategyV2 and WrappedEthereumDydxToken Contracts

To deploy the `GovernanceStrategyV2.sol` and `WrappedEthereumDydxToken.sol` contracts, you need to run the `deploy:upgrade-governance-strategy-v2-contracts` task in the `deploy-upgrade-governance-strategy-v2-contracts.ts` script. 

After the deployment script setup, as an example these two contracts can be deployed on mainnet as follows. Note that hardhat accesses the deployment private key via the `MNEMONIC` environment variables. **IMPORTANT:** Using a `MNEMONIC` in this way is highly insecure. On mainnet, a temporary mnemonic or an entirely different method should be used.

```bash
MNEMONIC=<...> npx hardhat --network mainnet deploy:upgrade-governance-strategy-v2-contracts
```

## Verifying the deployed GovernanceStrategyV2 and WrappedEthereumDydxToken Contracts

Perform the following steps to prepare for verifying the contracts, using the Ethereum mainnet network as an example.
1. Create an Etherscan API key by signing up for an Etherscan account, going to https://etherscan.io/myapikey and creating one.
1. Export the correct Etherscan API key for the network you deployed to. For example `export MAINNET_ETHERSCAN_API_KEY=<mainnet Etherscan API key>`.
1. Uncomment the correct environment variable from `hardhat.config.ts`, within the `hardhatConfig.etherscan.apiKey` key.
1. Copy the contract verification commands logged to stdout from the GovernanceStrategyV2 and WrappedEthereumDydxToken deployment scripts and run them with the correct Etherscan network (the default example logged to stdout is for mainnet).

# Creating the upgrade governance strategy V2 proposal.

This documentation uses mainnet as a example for creating the governance strategy V2 proposal.

You can copy the command that was logged to stdout after running the previous deployment script, but to re-iterate the following command can be ran to
log out the calldata for creating the upgrade governance strategy V2 proposal and should be exactly the same.

Note the default version of this script can be run without exposing your mnemonic. If you are fine with exposing your mnemonic and would
prefer the deployment script create the proposal, then you can pass `--log-calldata false` as an additional argument to the deployment script.

```bash
npx hardhat --network mainnet upgrade-governance-strategy-v2-proposal \
  --governance-strategy-v2-address <insert governance strategy V2 address>
```

### Using the calldata to create the upgrade governance strategy V2 proposal.

The below text uses Metamask as an example tool for creating the proposal, but this approach can be used on other setups
like Gnosis safe as well.

The calldata for creating the proposal will be logged to stdout. If you want to use Metamask to create a proposal using
this, you will first have to enable Hex Data in Metamask. If you do not have Hex Data enabled in MetaMask, go to
Settings > Advanced > Show Hex Data to turn on sending Hex Data when sending a transaction.

The TX should be sent to the DYDX governor contract. On mainnet, the DYDX governor contract is at address `0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2W`.

As an example, the steps for creating the proposal in Metamask on mainnet are the following:
1. Change your Metamask network to mainnet and the address to the one that has sufficient proposing power.
1. Click `send` on the default Metamask screen, and send the TX to the DYDX governor contract at `0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2`.
1. Copy the calldata logged out from the `upgrade-governance-strategy-v2-proposal` and paste it into the `Hex data` field.
1. Send the transaction.
