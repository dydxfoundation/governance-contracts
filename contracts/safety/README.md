# Safety Module

## Safety Module Recovery Tests

On Sep 8, 2021, the dYdX Safety Module experienced a bug due to an error in the deployment process. The cause and analysis of the problem were described by the dYdX Foundation in the [Safety Module Outage Report](https://dydx.foundation/blog/en/outage-1).

The `SafetyModuleV2` and `SM2Recovery` contracts have been implemented according to the outline provided by the article above. The fix was thoroughly tested in the context of the full system, in both local and mainnet fork environments. Instructions to run these tests are given below.

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
