// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IGovernancePowerDelegationERC20 } from '../../interfaces/IGovernancePowerDelegationERC20.sol';
import { IGovernanceStrategy } from '../../interfaces/IGovernanceStrategy.sol';
import { GovernancePowerDelegationERC20Mixin } from '../token/GovernancePowerDelegationERC20Mixin.sol';

interface IDydxToken {
  function _totalSupplySnapshots(
    uint256
  )
    external
    view
    returns (GovernancePowerDelegationERC20Mixin.Snapshot memory);

  function _totalSupplySnapshotsCount()
    external
    view
    returns (uint256);
}

/**
 * @title GovernanceStrategyV2
 * @author dYdX
 *
 * @notice Smart contract containing logic to measure users' relative governance power for creating
 *  and voting on proposals.
 *
 *  User Power = User Power from each of: DYDX, stkDYDX, wethDYDX.
 *  User Power from Token = Token Power + Token Power as Delegatee [- Token Power if user has delegated]
 * Two wrapper functions linked to DYDX tokens's GovernancePowerDelegationERC20Mixin.sol implementation
 * - getPropositionPowerAt: fetching a user Proposition Power at a specified block
 * - getVotingPowerAt: fetching a user Voting Power at a specified block
 */
contract GovernanceStrategyV2 is
  IGovernanceStrategy
{
  // ============ Constants ============

  /// @notice The DYDX governance token.
  address public immutable DYDX_TOKEN;

  /// @notice Token representing staked positions of the DYDX token.
  address public immutable STAKED_DYDX_TOKEN;

  /// @notice Token representing Wrapped Ethereum DYDX tokens.
  address public immutable WRAPPED_ETHEREUM_DYDX_TOKEN;

  // ============ Constructor ============

  constructor(
    address dydxToken,
    address stakedDydxToken,
    address wrappedEthereumDydxToken
  ) {
    DYDX_TOKEN = dydxToken;
    STAKED_DYDX_TOKEN = stakedDydxToken;
    WRAPPED_ETHEREUM_DYDX_TOKEN = wrappedEthereumDydxToken;
  }

  // ============ Other Functions ============

  /**
   * @notice Get the total supply of proposition power, for the purpose of determining if a
   *  proposing threshold was reached.
   *
   * @param  blockNumber  Block number at which to evaluate.
   *
   * @return The total proposition power supply at the given block number.
   */
  function getTotalPropositionSupplyAt(
    uint256 blockNumber
  )
    public
    view
    override
    returns (uint256)
  {
    return _getTotalSupplyAt(blockNumber);
  }

  /**
   * @notice Get the total supply of voting power, for the purpose of determining if quorum or vote
   *  differential tresholds were reached.
   *
   * @param  blockNumber  Block number at which to evaluate.
   *
   * @return The total voting power supply at the given block number.
   */
  function getTotalVotingSupplyAt(
    uint256 blockNumber
  )
    public
    view
    override
    returns (uint256)
  {
    return _getTotalSupplyAt(blockNumber);
  }

  /**
   * @notice The proposition power of an address at a given block number.
   *
   * @param  user         Address to check.
   * @param  blockNumber  Block number at which to evaluate.
   *
   * @return The proposition power of the address at the given block number.
   */
  function getPropositionPowerAt(
    address user,
    uint256 blockNumber
  )
    public
    view
    override
    returns (uint256)
  {
    return _getPowerByTypeAt(
      user,
      blockNumber,
      IGovernancePowerDelegationERC20.DelegationType.PROPOSITION_POWER
    );
  }

  /**
   * @notice The voting power of an address at a given block number.
   *
   * @param  user         Address of the user.
   * @param  blockNumber  Block number at which to evaluate.
   *
   * @return The voting power of the address at the given block number.
   */
  function getVotingPowerAt(
    address user,
    uint256 blockNumber
  )
    public
    view
    override
    returns (uint256)
  {
    return _getPowerByTypeAt(
      user,
      blockNumber,
      IGovernancePowerDelegationERC20.DelegationType.VOTING_POWER
    );
  }

  function _getPowerByTypeAt(
    address user,
    uint256 blockNumber,
    IGovernancePowerDelegationERC20.DelegationType powerType
  )
    internal
    view
    returns (uint256)
  {
    return (
      IGovernancePowerDelegationERC20(DYDX_TOKEN).getPowerAtBlock(
        user,
        blockNumber,
        powerType
      ) +
      IGovernancePowerDelegationERC20(STAKED_DYDX_TOKEN).getPowerAtBlock(
        user,
        blockNumber,
        powerType
      ) +
      IGovernancePowerDelegationERC20(WRAPPED_ETHEREUM_DYDX_TOKEN).getPowerAtBlock(
        user,
        blockNumber,
        powerType
      )
    );
  }

  /**
   * @dev The total supply of the DYDX token at a given block number.
   *
   * @param  blockNumber  Block number at which to evaluate.
   *
   * @return The total DYDX token supply at the given block number.
   */
  function _getTotalSupplyAt(
    uint256 blockNumber
  )
    internal
    view
    returns (uint256)
  {
    IDydxToken dydxToken = IDydxToken(DYDX_TOKEN);
    uint256 snapshotsCount = dydxToken._totalSupplySnapshotsCount();

    // Iterate in reverse over the total supply snapshots, up to index 1.
    for (uint256 i = snapshotsCount - 1; i != 0; i--) {
      GovernancePowerDelegationERC20Mixin.Snapshot memory snapshot = (
        dydxToken._totalSupplySnapshots(i)
      );
      if (snapshot.blockNumber <= blockNumber) {
        return snapshot.value;
      }
    }

    // If blockNumber was on or after the first snapshot, then return the initial supply.
    // Else, blockNumber is before token launch so return 0.
    GovernancePowerDelegationERC20Mixin.Snapshot memory firstSnapshot = (
      dydxToken._totalSupplySnapshots(0)
    );
    if (firstSnapshot.blockNumber <= blockNumber) {
      return firstSnapshot.value;
    } else {
      return 0;
    }
  }
}
