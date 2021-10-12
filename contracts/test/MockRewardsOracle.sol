// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;

import { IRewardsOracle } from '../interfaces/IRewardsOracle.sol';

contract MockRewardsOracle is IRewardsOracle {

  bytes32 _MERKLE_ROOT_;
  uint256 _EPOCH_;
  bytes _IPFS_CID_;

  function read()
    external
    override
    view
    returns (bytes32 merkleRoot, uint256 epoch, bytes memory ipfsCid)
  {
    return (_MERKLE_ROOT_, _EPOCH_, _IPFS_CID_);
  }

  function setMockValue(
    bytes32 merkleRoot,
    uint256 epoch,
    bytes calldata ipfsCid
  )
    external
  {
    _MERKLE_ROOT_ = merkleRoot;
    _EPOCH_ = epoch;
    _IPFS_CID_ = ipfsCid;
  }
}
