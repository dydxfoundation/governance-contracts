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

# Creating the Treasury Bridge proposal.

The following command can be ran to log out the calldata for creating the treasury bridge proposal.
Note this documentation uses mainnet as a example for creating the treasury bridge proposal.

The default version of this script can be run without exposing your mnemonic. If you are fine with exposing your mnemonic and would
prefer the deployment script create the proposal, then you can pass `--log-calldata false` as an additional argument to the deployment script.

```bash
npx hardhat --network mainnet deploy:treasury-bridge-proposal
```

### Using the calldata to create the treasury bridge proposal.

The below text uses Metamask as an example tool for creating the proposal, but this approach can be used on other setups
like Gnosis safe as well.

The calldata for creating the proposal will be logged to stdout. If you want to use Metamask to create a proposal using
this, you will first have to enable Hex Data in Metamask. If you do not have Hex Data enabled in MetaMask, go to
Settings > Advanced > Show Hex Data to turn on sending Hex Data when sending a transaction.

The TX should be sent to the DYDX governor contract. On mainnet, the DYDX governor contract is at address `0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2`.

As an example, the steps for creating the proposal in Metamask on mainnet are the following:
1. Change your Metamask network to mainnet and the address to the one that has sufficient proposing power.
1. Click `send` on the default Metamask screen, and send the TX to the DYDX governor contract at `0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2`.
1. Copy the calldata logged out from the `deploy:treasury-bridge-proposal` script and paste it into the `Hex data` field.
1. Send the transaction.

# Detailed calculations for DYDX tokens to bridge from the rewards treasury

All DYDX that is unallocated from rewards can be bridged to the community treasury on DYDX chain. Note that to
calculate the unallocated rewards, we can subtract the allocated rewards from the original total allocated rewards.

There were originally 450,000,000 DYDX tokens allocated to rewards. Specifically the initial allocations were the following:
- 25% of the token supply allocated to [trading rewards](https://docs.dydx.community/dydx-governance/rewards/trading-rewards).
- 7.5% of the token supply allocated to [retroactive mining rewards](https://docs.dydx.community/dydx-governance/rewards/retroactive-mining-rewards).
- 7.5% of the token supply allocated to [liquidity provider rewards](https://docs.dydx.community/dydx-governance/rewards/liquidity-provider-rewards).
- 2.5% of the token supply allocated to [liquidity module rewards](https://docs.dydx.community/dydx-governance/staking-pools/liquidity-staking-pool).
- 2.5% of the token supply allocated to [safety module rewards](https://docs.dydx.community/dydx-governance/staking-pools/safety-staking-pool).

## Currently allocated rewards up to epoch 28

As of epoch 28, 205,165,433.5392799029 DYDX were allocated to rewards. Reasoning:
- 173,204.7618238715 DYDX for safety module compensation ([source](https://github.com/dydxfoundation/governance-contracts/blob/18f2e9007831cab3e1c13cf8a29626ea4f416615/src/deploy-config/base-config.ts#L230)).
    -  Note this was taken from the rewards treasury.
- 5,116,733.9553627416 DYDX tokens allocated for safety module rewards. Reasoning:
    - Rewards rate was 0.1585489619 DYDX tokens per second.
        - 25,000,000 total DYDX / 157,679,998 seconds of rewards, which is 65.1785708699 epochs.
    - Rewards were allocated for 32,272,264 seconds. Reasoning:
        - Safety module rewards began being distributed on Nov-20-2021 04:42:55 AM UTC, which is unix timestamp 1637383375.
            - Note this was block 13649857 which contained the first safety module staking TX ([source](https://etherscan.io/tx/0x480c35631456098c0ec666cfa8e971eb970ea99a197f2b4e503b16cf99fc7216)).
            - Note the safety module proxy admin was upgraded on block 13649826 as part of [this executed proposal](https://etherscan.io/tx/0xfd332147899fd3ef1db62f262ffae92bbd7d18a5ed4e142eb0407a173dbf0453/advanced), but rewards were not allocated until there was a non-zero amount staked.
        - The safety module rewards were set to 0 on Nov-28-2022 05:13:59 PM UTC, which is unix timestamp 1669655639.
            - This occurred as part of a governance proposal executed on block 16069909 ([source](https://etherscan.io/tx/0xf98e9d0e0017fce10217477e7fab414b2210e9eebe28f450a71619ac036ad7fd/advanced#eventlog)).
        - 1669655639 - 1637383375 = 32,272,264 seconds.
- 5,779,607.8220932898 DYDX tokens were allocated for liquidity staking rewards. Reasoning:
    - Rewards rate was 0.1585489619 DYDX tokens per second.
        - 25,000,000 total DYDX / 157,679,998 seconds of rewards, which is 65.1785708699 epochs.
    - Rewards were allocated for 36,453,142 seconds. Reasoning:
        - The first staking TX occurred on Aug-03-2021 04:24:01 PM UTC, which is unix timestamp 1628007841.
            - Note this was block 12953339 which contained the first liquidity module staking TX ([source](https://etherscan.io/tx/0x3c0830f88a05298765e89e3c591dd4fb9579ea13ca4181ddd78bd47b9042a640)).
        - The liquidity module rewards were set to 0 on Sep-29-2022 02:16:23 PM UTC, which is unix timestamp 1664460983.
            - This occurred as part of a governance proposal executed on block 15639536 ([source](https://etherscan.io/tx/0xcda8c40f45aac4ef7f5d6aa5d82cb84e89057c03842b549c00151ffbae854a4e#eventlog)).
- 194,095,887 DYDX tokens were allocated for trading, MM, and retroactive mining rewards up to epoch 28 (note, this doesn't include epoch 29 rewards since they aren't allocated on-chain yet). Reasoning:
    - Latest V3 rewards are [here](https://hedgies.mypinata.cloud/ipfs/bafybeic22w5uxknvce4kzci7fftgezsccxgpvruyh2ro4a4qkbxpi5pdqu). Note this includes retroactive allocations as well.
    - Number can be reproduced by running the below script.

## Future allocated rewards after epoch 28

For epoch 29 and onwards, 4,315,071 DYDX will be allocated in rewards. Reasoning:
- Epoch 29 will allocate 2,157,535 DYDX tokens for MM and trading rewards.
    - 575,343 DYDX tokens will be allocated to MM rewards.
    - 1,582,192 DYDX tokens will be allocated for trading rewards.
- Epoch 30 will allocate 1,438,357 DYDX tokens for MM and trading rewards, which is 2/3 of the original amount.
    - 383,562 DYDX tokens will be allocated to MM rewards.
    - 1,054,795 DYDX tokens will be allocated for trading rewards (rounded up to the nearest whole number).
- Epoch 31 will allocate 719,179 DYDX tokens for MM and trading rewards, which is 1/3 of the original amount.
    - 191,781 DYDX tokens will be allocated to MM rewards.
    - 527,398 DYDX tokens will be allocated for trading rewards (rounded up to the nearest whole number).
- Epochs 32 and onwards will allocate 0 DYDX tokens to MM and trading rewards.

## Total DYDX allocated to rewards

In total there are 205,165,433.5392799029 DYDX + 4,315,071 DYDX = 209,480,504.5392799029 DYDX allocated to rewards.

## Total unallocated DYDX rewards that can be bridged

Therefore there are 450,000,000 DYDX - 209,480,504.5392799029 DYDX = 240,519,495.4607200971 DYDX that are unallocated to
rewards and can be bridged to the DYDX chain community treasury.

## Python script for calculating total trading rewards
```
import requests

def fetch_data(url):
    """Fetches data from the given URL."""
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def compute_cumulative_rewards(data):
    """Computes the cumulative rewards from the given data."""
    return sum(int(entry[1]) for entry in data)

def main():
    url = "https://hedgies.mypinata.cloud/ipfs/bafybeic22w5uxknvce4kzci7fftgezsccxgpvruyh2ro4a4qkbxpi5pdqu"
    data = fetch_data(url)
    total_rewards = compute_cumulative_rewards(data)
    print(f"Cumulative rewards: {total_rewards}")

if __name__ == "__main__":
    main()
```
