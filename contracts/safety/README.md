# Safety Module Recovery

On Sep 8, 2021, the dYdX Safety Module experienced a bug due to an error in the deployment process. The cause and analysis of the problem were described by the dYdX Foundation in the [Safety Module Outage Report](https://dydx.foundation/blog/en/outage-1).

The `SafetyModuleV2` and `SM2Recovery` contracts have been implemented according to the outline provided by the article above. The fix was thoroughly tested in the context of the full system, in both local and mainnet fork environments.

Instructions are given below to deploy the fix via a governance proposal and run the tests.

## Safety Module Recovery Deployment

First, the new `SafetyModuleV2` implementation contract must be deployed. It has the following changes:
* A new initializer function which:
  * Calls `transfer()` to send all held DYDX to the specified recovery contract.
  * Calls `transferFrom()` to send the specified additional compensation amount from the rewards treasury to the specified recovery contract.
  * Restores functionality to the Safety Module by setting the correct exchange rate.
  * Deletes data set by the original initializer, which is now garbage due to the shift in the storage layout.
* `DISTRIBUTION_END` is updated to account for the delayed start to the Safety Module rewards.
* `getRevision()` updated to return 2

Next, the `SM2Recovery` contract is deployed. It contains the exact addresses and owed DYDX amounts to be distributed.

These two contracts are deployed as follows. Note that hardhat must be configured for mainnet via [hardhat.config.ts](/hardhat.config.ts). This can be accomplished by passing in the `ALCHEMY_KEY` and `MNEMONIC` environment variables. **IMPORTANT:** Using a `MNEMONIC` in this way is highly insecure. On mainnet, a temporary mnemonic or an entirely different method should be used.

```bash
export ALCHEMY_KEY=<...>
npx hardhat --network mainnet deploy:safety-module-recovery \
  --dydx-token-address         0x92D6C1e31e14520e676a687F0a93788B716BEff5 \
  --rewards-treasury-address   0x639192D54431F8c816368D3FB4107Bc168d0E871
```

The newly deployed addresses will be logged to the console. The governance proposal to perform the upgrade can be created as follows. The proposer must have 2% of the total DYDX supply (20M tokens) in their account and/or delegated to them as “proposition power.”

```bash
npx hardhat --network mainnet deploy:safety-module-recovery-proposal \
  --proposal-ipfs-hash-hex              0x...                                      \
  --governor-address                    0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2 \
  --long-timelock-address               0xEcaE9BF44A21d00E2350a42127A377Bf5856d84B \
  --safety-module-address               0x65f7BA4Ec257AF7c55fd5854E5f6356bBd0fb8EC \
  --safety-module-proxy-admin-address   0x6aaD0BCfbD91963Cf2c8FB042091fd411FB05b3C \
  --safety-module-new-impl-address      0x...                                      \
  --safety-module-recovery-address      0x...
```

## Safety Module Recovery Tests

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
TEST_SM_RECOVERY_WITH_PROPOSAL=false npm run test:fork

# Run tests on a mainnet fork (full version) (4 minutes).
npm run test:fork
```

### Mainnet Read-Only Tests

Read-only tests can be run against mainnet directly, using the following command. By design, several test cases will **fail** until the Safety Module fix has been implemented on mainnet.

```bash
npx hardhat test --network mainnet \
  test/safety-module/state.spec.ts \
  test/safety-module/storage-slots.spec.ts \
  test/safety-module/events.spec.ts \
  test/safety-module/bytecode.spec.ts
```

The following tests with **fail** with `--network mainnet`, until the Safety Module fix is implemented on mainnet:

```
SafetyModuleV2 initial state
  1) Distribution start and end are set during contract creation
  2) Initializes the exchange rate to a value of one
  3) Has no DYDX tokens
  4) The implementation is set to the V2 implementation

SafetyModuleV2 initial storage slots
  5) 51–101: VersionedInitializable
  6) 102–127: SM1Storage

SafetyModule contract bytecode
  7) The implementation has the expected bytecode
```
