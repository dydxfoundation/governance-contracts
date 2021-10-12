// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { Ownable } from '../dependencies/open-zeppelin/Ownable.sol';
import { IStarkPerpetual } from '../interfaces/IStarkPerpetual.sol';

/**
 * @title StarkExRemoverGovernor
 * @author dYdX
 *
 * @notice This is a StarkEx governor contract whose sole purpose is to remove another governor.
 *
 *  This contract can be nominated by a StarkEx governor in order to allow themselves to be removed
 *  “automatically” from the governor role. The governor should nominate this contract to the main
 *  and proxy governor roles, while ensuring that the GOVERNOR_TO_REMOVE address is correctly set
 *  to their own address.
 */
contract StarkExRemoverGovernor is
  Ownable
{
  IStarkPerpetual public immutable STARK_PERPETUAL;
  address public immutable GOVERNOR_TO_REMOVE;

  constructor(
    address starkPerpetual,
    address governorToRemove
  ) {
    STARK_PERPETUAL = IStarkPerpetual(starkPerpetual);
    GOVERNOR_TO_REMOVE = governorToRemove;
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

  function mainRemoveGovernor()
    external
    onlyOwner
  {
    STARK_PERPETUAL.mainRemoveGovernor(GOVERNOR_TO_REMOVE);
  }

  function proxyRemoveGovernor()
    external
    onlyOwner
  {
    STARK_PERPETUAL.proxyRemoveGovernor(GOVERNOR_TO_REMOVE);
  }
}
