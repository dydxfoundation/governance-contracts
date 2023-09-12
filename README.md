# dYdX Governance Smart Contracts

Dashboard for interacting with the contracts: https://dydx.community/

Documentation: https://docs.dydx.community/

Deployed contract addresses: https://docs.dydx.community/dydx-governance/resources/technical-overview

## Audits

All major new smart contracts have been audited by Peckshield:

* [LiquidityStakingV1](./contracts/liquidity/v1) audited at [59b4ab0](https://github.com/dydxfoundation/governance-contracts/commit/59b4ab086b0603e55290cd49d5035aa6b03568d3)
* [StarkProxyV1](./contracts/stark-proxy/v1) audited at [3fd209c](https://github.com/dydxfoundation/governance-contracts/commit/3fd209c768da33d138a74092b196c38c970c2342)
* SafetyModuleV1 audited at [f816626](https://github.com/dydxfoundation/governance-contracts/commit/f8166261211040b70e7a6e40ae31e8abcbfa50ab)
* MerkleDistributorV1 audited at [3fd209c](https://github.com/dydxfoundation/governance-contracts/commit/3fd209c768da33d138a74092b196c38c970c2342)

The core governance and token contracts are based on the AAVE governance contracts (audited by Peckshield) and AAVE token contracts (audited by CertiK and Certora).

The following contracts supporting a potential migration of DYDX from Ethereum to the dYdX Chain (if and when deployed) have also been audited:

* [WrappedEthereumDydxToken]([url](https://github.com/dydxfoundation/governance-contracts/tree/master/contracts/governance/bridge)) 
* [GovernanceStrategyV2]([url](https://github.com/dydxfoundation/governance-contracts/blob/master/contracts/governance/strategy/GovernanceStrategyV2.sol))
* [TreasuryBridge]([url](https://github.com/dydxfoundation/governance-contracts/blob/master/contracts/treasury/TreasuryBridge.sol))

Audit report:
[https://github.com/dydxfoundation/governance-contracts/tree/master/audits](url)
