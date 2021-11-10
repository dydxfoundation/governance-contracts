# Stark Proxy Fix

This `README` describes how to upgrade the stark proxy contracts to support cancelling and reclaiming pending deposits from the dYdX L2 exchange. Further detail can be found in the [Commonwealth discussion](https://forums.dydx.community/proposal/discussion/2437-drc-smart-contract-upgrade-for-market-maker-borrowers-from-liquidity-staking-pool/).

## StarkProxyV2 Implementation Deployment

First, the new `StarkProxyV2` implementation contract is deployed. It has the following changes:
* `depositCancel()` for cancelling pending deposits to the dYdX L2 exchange.
* `depositReclaim()` for reclaiming cancelled deposits to the dYdX L2 exchange.
* `getRevision()` updated to return 2
* A new empty initializer function

This implementation contract is deployed as follows. Note that hardhat must be configured for mainnet via [hardhat.config.ts](/hardhat.config.ts). This can be accomplished by passing in the `ALCHEMY_KEY` and `MNEMONIC` environment variables. **IMPORTANT:** Using a `MNEMONIC` in this way is highly insecure. On mainnet, a temporary mnemonic or an entirely different method should be used.

```bash
export ALCHEMY_KEY=<...>
export MNEMONIC=<...>
npx hardhat --network mainnet deploy:stark-proxy-v2
```

The newly deployed address will be logged to the console.

## Governance Proposal: Stark Proxy Fix

Following the deployment above, a governance proposal can be created to upgrade all stark proxy contracts to the new implementation. The proposal must be executed by the short timelock, so the proposer must have 0.5% of the total DYDX supply (5M tokens) in their account and/or delegated to them as “proposition power.”

This governance proposal is proposed as follows. Note that hardhat must be configured for mainnet via [hardhat.config.ts](/hardhat.config.ts). This can be accomplished by passing in the `ALCHEMY_KEY` and `MNEMONIC` environment variables. **IMPORTANT:** Using a `MNEMONIC` in this way is highly insecure. On mainnet, a temporary mnemonic or an entirely different method should be used.

```bash
export ALCHEMY_KEY=<...>
export MNEMONIC=<...>
npx hardhat --network mainnet deploy:stark-proxy-fix-proposal \
  --proposal-ipfs-hash-hex              0x...                                      \
  --stark-proxy-new-impl-address        0x...                                      \
```

## Stark Proxy Fix Tests

```bash
# Initial setup and compilation.
git clone git@github.com:dydxfoundation/governance-contracts.git
cd governance-contracts
npm install
npm run compile

# Run the core test suite against a local hardhat deployment (1.5 minutes).
npm run test

# Run locally with additional invariant checks + test all affected addresses (2.5 minutes).
npm run test:full

# Run tests on a mainnet fork (faster version, mocks out the governance proposal).
TEST_SP_FIX_WITH_PROPOSAL=false npm run test:fork

# Run tests on a mainnet fork (full version) (4 minutes).
npm run test:fork
```
