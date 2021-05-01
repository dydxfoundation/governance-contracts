const accounts = require(`./test-wallets.ts`).accounts;

module.exports = {
  // TODO: Only skip dependencies and mocks.
  skipFiles: [
    'dependencies/',
    'staking/',
    'lib/',
    'interfaces/',
    'utils/',
    'mocks/',
  ],
  mocha: {
    enableTimeouts: false,
  },
  providerOptions: {
    accounts,
  },
};
