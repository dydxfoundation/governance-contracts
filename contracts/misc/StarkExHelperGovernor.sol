// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { Ownable } from '../dependencies/open-zeppelin/Ownable.sol';
import { IStarkPerpetual } from '../interfaces/IStarkPerpetual.sol';

/**
 * @title StarkExHelperGovernor
 * @author dYdX
 *
 * @notice This is a StarkEx governor which can be used by the owner to execute config changes.
 */
contract StarkExHelperGovernor is
  Ownable
{
  IStarkPerpetual public immutable STARK_PERPETUAL;

  constructor(
    address starkPerpetual
  ) {
    STARK_PERPETUAL = IStarkPerpetual(starkPerpetual);
  }

  function mainAcceptGovernance()
    external
    onlyOwner
  {
    STARK_PERPETUAL.mainAcceptGovernance();
  }

  /**
   * @notice Helper function to register and apply multiple asset configuration changes.
   *
   *  Requires that there is no timelock set on the StarkEx contract.
   *
   * @param  assetIds      Array of asset IDs for the assets to be configured.
   * @param  configHashes  Array of hashes of the asset configurations.
   */
  function executeAssetConfigurationChanges(
    uint256[] calldata assetIds,
    bytes32[] calldata configHashes
  )
    external
    onlyOwner
  {
    require(
      assetIds.length == configHashes.length,
      'StarkExHelperGovernor: Input params must have the same length'
    );
    for (uint256 i = 0; i < assetIds.length; i++) {
      STARK_PERPETUAL.registerAssetConfigurationChange(assetIds[i], configHashes[i]);
      STARK_PERPETUAL.applyAssetConfigurationChange(assetIds[i], configHashes[i]);
    }
  }

  /**
   * @notice Helper function to register and apply a global configuration change.
   *
   *  Requires that there is no timelock set on the StarkEx contract.
   *
   * @param  configHash  The hash of the global configuration.
   */
  function executeGlobalConfigurationChange(
    bytes32 configHash
  )
    external
    onlyOwner
  {
    STARK_PERPETUAL.registerGlobalConfigurationChange(configHash);
    STARK_PERPETUAL.applyGlobalConfigurationChange(configHash);
  }
}
