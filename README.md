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

* [WrappedEthereumDydxToken](https://github.com/dydxfoundation/governance-contracts/tree/master/contracts/governance/bridge) audited at [7ca15b0](https://github.com/dydxfoundation/governance-contracts/commit/7ca15b0b139e21bf378e12d318b782510c1c605b))
* [GovernanceStrategyV2](https://github.com/dydxfoundation/governance-contracts/blob/master/contracts/governance/strategy/GovernanceStrategyV2.sol) audited at [7ca15b0](https://github.com/dydxfoundation/governance-contracts/commit/7ca15b0b139e21bf378e12d318b782510c1c605b))
* [TreasuryBridge](https://github.com/dydxfoundation/governance-contracts/blob/master/contracts/treasury/TreasuryBridge.sol) audited at [7ca15b0](https://github.com/dydxfoundation/governance-contracts/commit/7ca15b0b139e21bf378e12d318b782510c1c605b)

Audit report:
[https://github.com/dydxfoundation/governance-contracts/tree/master/audits](url)

# Licensing

The primary license for dYdX Foundation `governance-contracts` is the GNU Affero General Public License v3.0 (`AGPL-3.0`), see [LICENSE](https://github.com/dydxfoundation/governance-contracts/blob/master/LICENSE.md). 

Other Exceptions

`contracts/libraries/FullMath.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/misc/StarkExHelperGovernor.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/misc/StarkExRemoverGovernor.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/misc/ClaimsProxy.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/misc/StarkExRemoverGovernorV2.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/misc/TreasuryMerkleClaimProxy.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/test/IFreezableStarkPerpetual.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/test/MockRewardsOracle.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/test/MockStarkPerpetual.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/test/MockSafetyModuleSubclass.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/utils/ReentrancyGuard.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/utils/Math.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/interfaces/IStarkPerpetual.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/interfaces/IRewardsOracle.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/interfaces/IMerkleDistributorV1.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)
`contracts/interfaces/ILiquidityStakingV1.sol` is licensed under `Apache-2.0` (as indicated in its SPDX header)

`contracts/dependencies/open-zeppelin/AdminUpgradeabilityProxy.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/BaseUpgradeabilityProxy.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/ERC20.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/ProxyAdmin.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/Ownable.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/SafeERC20.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/SafeMath.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/BaseAdminUpgradeabilityProxy.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/Address.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/AccessControlUpgradeable.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/OwnableUpgradeable.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/Proxy.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/MerkleProof.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/Context.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/Strings.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/UpgradeabilityProxy.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/ERC165.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/IERC165.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/open-zeppelin/AccessControl.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/dependencies/makerdao/multicall2.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/governance/bridge/IBridge.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/treasury/TreasuryVester.sol` is licensed under `MIT` (as indicated in its SPDX header)
`contracts/interfaces/IERC20.sol` is licensed under `MIT` (as indicated in its SPDX header)
