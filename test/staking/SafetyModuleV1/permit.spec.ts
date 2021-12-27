import { expect, use } from 'chai';
import { fail } from 'assert';
import { parseEther } from 'ethers/lib/utils';

import { deployPhase2, makeSuite, TestEnv } from '../../test-helpers/make-suite';
import { DRE, evmRevert, evmSnapshot, waitForTx } from '../../../helpers/misc-utils';
import { buildPermitParams, getSignatureFromTypedData } from '../../../helpers/contracts-helpers';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../../helpers/constants';

const SAFETY_MODULE_EIP_712_DOMAIN_NAME = 'dYdX Safety Module';

const snapshots = new Map<string, string>();
const snapshotName = 'init';

makeSuite('Safety Module Staked DYDX - Permit', deployPhase2, (testEnv: TestEnv) => {

  before(async () => {
    snapshots.set(snapshotName, await evmSnapshot());
  });

  afterEach(async () => {
    await evmRevert(snapshots.get(snapshotName)!);
    snapshots.set(snapshotName, await evmSnapshot());
  });

  it('sanity check chain ID', async () => {
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const configChainId = DRE.network.config.chainId;
    expect(configChainId).to.be.equal(chainId);
  })

  it('Reverts submitting a permit with 0 expiration', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const expiration = 0;
    const nonce = (await safetyModule.nonces(owner)).toNumber();
    const permitAmount = parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      safetyModule.address,
      owner,
      spender,
      nonce,
      permitAmount,
      expiration.toFixed(),
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    expect((await safetyModule.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      safetyModule
        .connect(users[1].signer)
        .permit(owner, spender, permitAmount, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');

    expect((await safetyModule.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_AFTER_PERMIT'
    );
  });

  it('Submits a permit with maximum expiration length', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const configChainId = DRE.network.config.chainId;

    expect(configChainId).to.be.equal(chainId);
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await safetyModule.nonces(owner)).toNumber();
    const permitAmount = parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      safetyModule.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    expect((await safetyModule.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await safetyModule
        .connect(users[1].signer)
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );

    expect((await safetyModule.nonces(owner)).toNumber()).to.be.equal(1);
  });

  it('Cancels the previous permit', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;

    {
      const permitAmount = parseEther('2').toString();

      const nonce = (await safetyModule.nonces(owner)).toNumber();
      const msgParams = buildPermitParams(
        chainId,
        safetyModule.address,
        owner,
        spender,
        nonce,
        deadline,
        permitAmount,
        SAFETY_MODULE_EIP_712_DOMAIN_NAME,
      );

      const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
      if (!ownerPrivateKey) {
        throw new Error('INVALID_OWNER_PK');
      }

      expect((await safetyModule.allowance(owner, spender)).toString()).to.be.equal(
        '0',
        'INVALID_ALLOWANCE_BEFORE_PERMIT'
      );

      const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      await safetyModule
        .connect(users[1].signer)
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    }

    {
      const nonce = (await safetyModule.nonces(owner)).toNumber();
      const permitAmount = '0';
      const msgParams = buildPermitParams(
        chainId,
        safetyModule.address,
        owner,
        spender,
        nonce,
        deadline,
        permitAmount,
        SAFETY_MODULE_EIP_712_DOMAIN_NAME,
      );

      const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
      if (!ownerPrivateKey) {
        throw new Error('INVALID_OWNER_PK');
      }

      const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      expect((await safetyModule.allowance(owner, spender)).toString()).to.be.equal(
        parseEther('2'),
        'INVALID_ALLOWANCE_BEFORE_PERMIT'
      );

      await waitForTx(
        await safetyModule
          .connect(users[1].signer)
          .permit(owner, spender, permitAmount, deadline, v, r, s)
      );
      expect((await safetyModule.allowance(owner, spender)).toString()).to.be.equal(
        permitAmount,
        'INVALID_ALLOWANCE_AFTER_PERMIT'
      );

      expect((await safetyModule.nonces(owner)).toNumber()).to.be.equal(2);
    }
  });

  it('Tries to submit a permit with invalid nonce', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      safetyModule.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      safetyModule.connect(users[1].signer).permit(owner, spender, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid expiration (previous to the current block)', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const expiration = '1';
    const nonce = (await safetyModule.nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      safetyModule.address,
      owner,
      spender,
      nonce,
      expiration,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      safetyModule
        .connect(users[1].signer)
        .permit(owner, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('Tries to submit a permit with invalid signature', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await safetyModule.nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      safetyModule.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      safetyModule
        .connect(users[1].signer)
        .permit(owner, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid owner', async () => {
    const { deployer, users, safetyModule } = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const { chainId } = await DRE.ethers.provider.getNetwork();
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await safetyModule.nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      safetyModule.address,
      owner,
      spender,
      nonce,
      expiration,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = require('../../../test-wallets').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      safetyModule
        .connect(users[1].signer)
        .permit(ZERO_ADDRESS, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith('INVALID_OWNER');
  });
});
