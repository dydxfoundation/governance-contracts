// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { Ownable } from '../dependencies/open-zeppelin/Ownable.sol';
import { IStarkPerpetual } from '../interfaces/IStarkPerpetual.sol';

/**
 * @title StarkExRemoverGovernorV2
 * @author dYdX
 *
 * @notice This is a StarkEx governor contract whose sole purpose is to remove other governors.
 *
 *  This contract can be nominated by a StarkEx governor in order to allow themselves to be removed
 *  “automatically” from the governor role. The governor should nominate this contract to the main
 *  and proxy governor roles, while ensuring that the MAIN_GOVERNORS_TO_REMOVE and
 *  PROXY_GOVERNORS_TO_REMOVE values are correctly set.
 */
contract StarkExRemoverGovernorV2 is
  Ownable
{
  IStarkPerpetual public immutable STARK_PERPETUAL;
  address[] public MAIN_GOVERNORS_TO_REMOVE;
  address[] public PROXY_GOVERNORS_TO_REMOVE;

  constructor(
    address starkPerpetual,
    address[] memory mainGovernorsToRemove,
    address[] memory proxyGovernorsToRemove
  ) {
    STARK_PERPETUAL = IStarkPerpetual(starkPerpetual);
    MAIN_GOVERNORS_TO_REMOVE = mainGovernorsToRemove;
    PROXY_GOVERNORS_TO_REMOVE = proxyGovernorsToRemove;
  }

  function mainAcceptGovernance()
    external
    onlyOwner
  {
    STARK_PERPETUAL.mainAcceptGovernance();
  }

  function proxyAcceptGovernance()
    external
    onlyOwner
  {
    STARK_PERPETUAL.proxyAcceptGovernance();
  }

  function mainRemoveGovernor(
    uint256 i
  )
    external
    onlyOwner
  {
    STARK_PERPETUAL.mainRemoveGovernor(MAIN_GOVERNORS_TO_REMOVE[i]);
  }

  function proxyRemoveGovernor(
    uint256 i
  )
    external
    onlyOwner
  {
    STARK_PERPETUAL.proxyRemoveGovernor(PROXY_GOVERNORS_TO_REMOVE[i]);
  }

  function numMainGovernorsToRemove()
    external
    view
    returns (uint256)
  {
    return MAIN_GOVERNORS_TO_REMOVE.length;
  }

  function numProxyGovernorsToRemove()
    external
    view
    returns (uint256)
  {
    return PROXY_GOVERNORS_TO_REMOVE.length;
  }
}
