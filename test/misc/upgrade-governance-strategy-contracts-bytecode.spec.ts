import { ethers } from 'hardhat';
import { verifyContract } from '../../src/lib/verify-contract-bytecode';
import { describeContract, TestContext } from '../helpers/describe-contract';

function init() {}

describeContract('Upgrade Governance Strategy Contracts bytecode', init, (ctx: TestContext) => {

  it('The governance strategy V2 contract has the expected bytecode', async () => {
    await verifyContract(
      'contracts/governance/strategy/',
      'GovernanceStrategyV2',
      ctx.governanceStrategyV2.address,
      {
        DYDX_TOKEN: ctx.dydxToken.address,
        STAKED_DYDX_TOKEN: ctx.safetyModule.address,
        WRAPPED_ETHEREUM_DYDX_TOKEN: ctx.wrappedDydxToken.address,
      },
    );
  });

  it('The wrapped Ethereum DYDX token has the expected bytecode', async () => {
    const chainId = 1;
    const NAME_HASH: string = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Wrapped Ethereum DYDX'));
    const EIP712_VERSION_HASH: string = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('1'));
    const EIP712_DOMAIN: string = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
    ));

    const domainSeparator: string = ethers.utils.keccak256(new ethers.utils.AbiCoder().encode(
        [
        'bytes32',
        'bytes32',
        'bytes32',
        'uint256',
        'address',
        ],
        [
        EIP712_DOMAIN,
        NAME_HASH,
        EIP712_VERSION_HASH,
        chainId,
        ctx.wrappedDydxToken.address,
        ],
    ));

    await verifyContract(
      'contracts/governance/bridge/',
      'WrappedEthereumDydxToken',
      ctx.wrappedDydxToken.address,
      {
        DYDX_TOKEN: ctx.dydxToken.address,
        DOMAIN_SEPARATOR: domainSeparator, 
      },
    );
  });
});
