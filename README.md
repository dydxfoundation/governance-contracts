# dYdX Governance and Staking Contracts

## Getting started

```bash
npm install
npm test
npm run coverage
```

## Contracts

This repo contains the following smart contracts in the [contracts](./contracts/) directory:
* [liquidity](./contracts/liquidity): Contains the Liquidity Staking Module written by dYdX.
* [stark-proxy](./contracts/stark-proxy): Contains the StarkEx proxy contract written by dYdX for use with Liquidity Staking.
* [merkle-distributor](./contracts/merkle-distributor): Contains the merkle tree distributor contract written by dYdX, inspired by the Badger Finance [BadgerTree contract](https://github.com/Badger-Finance/badger-system).
* [staking](./contracts/staking): Contains the Saftey Module and related staking contracts, based on [AAVE's Safety Module and staking contracts](https://github.com/aave/aave-stake-v2/).
* [dependencies/open-zeppelin](./contracts/dependencies/open-zeppelin): Smart contract libraries by OpenZeppelin, from their [contracts library](https://github.com/OpenZeppelin/openzeppelin-contracts).
* [interfaces](./contracts/interfaces), [lib](./contracts/lib), [mocks](./contracts/mocks), [utils](./contracts/utils): Contains helper smart contract files. Many of these are from or based on AAVE's [staking repository](https://github.com/aave/aave-stake-v2/).
