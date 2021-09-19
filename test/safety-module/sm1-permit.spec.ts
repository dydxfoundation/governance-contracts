import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../src/lib/constants';
import { waitForTx } from '../../src/lib/util';
import { describeContract, TestContext } from '../helpers/describe-contract';
import { getDeployerKey } from '../helpers/keys';
import { buildPermitParams, getSignatureFromTypedData } from '../helpers/signature-helpers';
import hre from '../hre';

const SAFETY_MODULE_EIP_712_DOMAIN_NAME = 'dYdX Safety Module';

let ownerKey: string;

function init() {
  ownerKey = getDeployerKey();
}

describeContract('Safety Module Staked DYDX - ERC20 Permit', init, (ctx: TestContext) => {

  it('sanity check chain ID', async () => {
    const { chainId } = await hre.ethers.provider.getNetwork();
    expect(!!chainId).to.be.true('Network does not have chainId');
    const configChainId = hre.network.config.chainId;
    expect(configChainId).to.be.equal(chainId);
  });

  it('Reverts submitting a permit with 0 expiration', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const expiration = 0;
    const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
    const permitAmount = parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      ctx.safetyModule.address,
      owner,
      spender,
      nonce,
      permitAmount,
      expiration.toFixed(),
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = ownerKey;

    expect((await ctx.safetyModule.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT',
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      ctx.safetyModule
        .connect(ctx.users[0])
        .permit(owner, spender, permitAmount, expiration, v, r, s),
    ).to.be.revertedWith('INVALID_EXPIRATION');

    expect((await ctx.safetyModule.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_AFTER_PERMIT',
    );
  });

  it('Submits a permit with maximum expiration length', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const configChainId = hre.network.config.chainId;

    expect(configChainId).to.be.equal(chainId);
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
    const permitAmount = parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      ctx.safetyModule.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = ownerKey;

    expect((await ctx.safetyModule.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT',
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await ctx.safetyModule
        .connect(ctx.users[0])
        .permit(owner, spender, permitAmount, deadline, v, r, s),
    );

    expect((await ctx.safetyModule.nonces(owner)).toNumber()).to.be.equal(1);
  });

  it('Cancels the previous permit', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;

    {
      const permitAmount = parseEther('2').toString();

      const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
      const msgParams = buildPermitParams(
        chainId,
        ctx.safetyModule.address,
        owner,
        spender,
        nonce,
        deadline,
        permitAmount,
        SAFETY_MODULE_EIP_712_DOMAIN_NAME,
      );

      const ownerPrivateKey = ownerKey;

      expect((await ctx.safetyModule.allowance(owner, spender)).toString()).to.be.equal(
        '0',
        'INVALID_ALLOWANCE_BEFORE_PERMIT',
      );

      const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      await ctx.safetyModule
        .connect(ctx.users[0])
        .permit(owner, spender, permitAmount, deadline, v, r, s);
    }

    {
      const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
      const permitAmount = '0';
      const msgParams = buildPermitParams(
        chainId,
        ctx.safetyModule.address,
        owner,
        spender,
        nonce,
        deadline,
        permitAmount,
        SAFETY_MODULE_EIP_712_DOMAIN_NAME,
      );

      const ownerPrivateKey = ownerKey;

      const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      expect((await ctx.safetyModule.allowance(owner, spender)).toString()).to.be.equal(
        parseEther('2'),
        'INVALID_ALLOWANCE_BEFORE_PERMIT',
      );

      await waitForTx(
        await ctx.safetyModule
          .connect(ctx.users[0])
          .permit(owner, spender, permitAmount, deadline, v, r, s),
      );
      expect((await ctx.safetyModule.allowance(owner, spender)).toString()).to.be.equal(
        permitAmount,
        'INVALID_ALLOWANCE_AFTER_PERMIT',
      );

      expect((await ctx.safetyModule.nonces(owner)).toNumber()).to.be.equal(2);
    }
  });

  it('Tries to submit a permit with invalid nonce', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      ctx.safetyModule.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = ownerKey;

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      ctx.safetyModule.connect(ctx.users[0]).permit(owner, spender, permitAmount, deadline, v, r, s),
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid expiration (previous to the current block)', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const expiration = '1';
    const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      ctx.safetyModule.address,
      owner,
      spender,
      nonce,
      expiration,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = ownerKey;

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      ctx.safetyModule
        .connect(ctx.users[0])
        .permit(owner, spender, expiration, permitAmount, v, r, s),
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('Tries to submit a permit with invalid signature', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      ctx.safetyModule.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = ownerKey;

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      ctx.safetyModule
        .connect(ctx.users[0])
        .permit(owner, ZERO_ADDRESS, permitAmount, deadline, v, r, s),
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid owner', async () => {
    const owner = ctx.deployer.address;
    const spender = ctx.users[0].address;

    const { chainId } = await hre.ethers.provider.getNetwork();
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await ctx.safetyModule.nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      ctx.safetyModule.address,
      owner,
      spender,
      nonce,
      expiration,
      permitAmount,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );

    const ownerPrivateKey = ownerKey;

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      ctx.safetyModule
        .connect(ctx.users[0])
        .permit(ZERO_ADDRESS, spender, expiration, permitAmount, v, r, s),
    ).to.be.revertedWith('INVALID_OWNER');
  });
});
