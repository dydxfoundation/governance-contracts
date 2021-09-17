// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../dependencies/open-zeppelin/SafeMath.sol';
import { IDydxGovernor } from '../../interfaces/IDydxGovernor.sol';
import { IGovernanceStrategy } from '../../interfaces/IGovernanceStrategy.sol';
import { IProposalValidator } from '../../interfaces/IProposalValidator.sol';

/**
 * @title ProposalValidatorMixin
 * @author dYdX
 *
 * @notice Validates state transitions for governance proposals.
 *
 *  Responsible for the following:
 *   - Check proposition power to validate the creation or cancellation of proposals.
 *   - Check voting power to validate the success of proposals.
 */
abstract contract ProposalValidatorMixin is
  IProposalValidator
{
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice Minimum fraction of supply needed to submit a proposal.
  ///  Denominated in units out of ONE_HUNDRED_WITH_PRECISION.
  uint256 public immutable override PROPOSITION_THRESHOLD;

  /// @notice Duration of the voting period, in blocks.
  uint256 public immutable override VOTING_DURATION;

  /// @notice Minimum fraction of supply by which `for` votes must exceed `against` votes in order
  ///  for a proposal to pass. Denominated in units out of ONE_HUNDRED_WITH_PRECISION.
  uint256 public immutable override VOTE_DIFFERENTIAL;

  /// @notice Minimum fraction of the supply which a proposal must receive in `for` votes in order
  ///  for the proposal to pass. Denominated in units out of ONE_HUNDRED_WITH_PRECISION.
  uint256 public immutable override MINIMUM_QUORUM;

  /// @notice Represents 100%, for the purpose of specifying governance power thresholds.
  uint256 public constant override ONE_HUNDRED_WITH_PRECISION = 10000;

  // ============ Constructor ============

  /**
   * @notice Constructor.
   *
   * @param  propositionThreshold  Minimum fraction of supply needed to submit a proposal.
   *                               Denominated in units out of ONE_HUNDRED_WITH_PRECISION.
   * @param  votingDuration        Duration of the voting period, in blocks.
   * @param  voteDifferential      Minimum fraction of supply by which `for` votes must exceed
   *                               `against` votes in order for a proposal to pass.
   *                               Denominated in units out of ONE_HUNDRED_WITH_PRECISION.
   * @param  minimumQuorum         Minimum fraction of the supply which a proposal must receive
   *                               in `for` votes in order for the proposal to pass.
   *                               Denominated in units out of ONE_HUNDRED_WITH_PRECISION.
   */
  constructor(
    uint256 propositionThreshold,
    uint256 votingDuration,
    uint256 voteDifferential,
    uint256 minimumQuorum
  ) {
    PROPOSITION_THRESHOLD = propositionThreshold;
    VOTING_DURATION = votingDuration;
    VOTE_DIFFERENTIAL = voteDifferential;
    MINIMUM_QUORUM = minimumQuorum;
  }

  // ============ External and Public Functions ============

  /**
   * @notice Called to validate proposal creation.
   *
   *  A proposal may be created if the creator's proposition power meets the proposition threshold.
   *
   * @param  governor     Governor contract.
   * @param  user         Address of the proposal creator.
   * @param  blockNumber  Block number at which to check governance power (e.g. current block - 1).
   *
   * @return Boolean `true` if proposal may be created, otherwise `false`.
   */
  function validateCreatorOfProposal(
    IDydxGovernor governor,
    address user,
    uint256 blockNumber
  )
    external
    view
    override
    returns (bool)
  {
    return isPropositionPowerEnough(governor, user, blockNumber);
  }

  /**
   * @notice Called to validate proposal cancellation.
   *
   *  A proposal may be canceled if the creator's proposition power is below the proposition
   *  threshold.
   *
   * @param  governor     Governor contract.
   * @param  user         Address of the proposal creator.
   * @param  blockNumber  Block number at which to check governance power (e.g. current block - 1).
   *
   * @return Boolean `true` if the proposal may be canceled, otherwise `false`.
   */
  function validateProposalCancellation(
    IDydxGovernor governor,
    address user,
    uint256 blockNumber
  )
    external
    view
    override
    returns (bool)
  {
    return !isPropositionPowerEnough(governor, user, blockNumber);
  }

  /**
   * @notice Check whether a user has enough proposition power to create and maintain a proposal.
   *
   * @param  governor     Governor contract.
   * @param  user         Address of the proposal creator.
   * @param  blockNumber  Block number at which to check governance power.
   *
   * @return Boolean `true` if the user has enough proposition power, otherwise `false`.
   */
  function isPropositionPowerEnough(
    IDydxGovernor governor,
    address user,
    uint256 blockNumber
  )
    public
    view
    override
    returns (bool)
  {
    IGovernanceStrategy currentGovernanceStrategy = IGovernanceStrategy(
      governor.getGovernanceStrategy()
    );
    return (
      currentGovernanceStrategy.getPropositionPowerAt(user, blockNumber) >=
      getMinimumPropositionPowerNeeded(governor, blockNumber)
    );
  }

 /**
   * @notice Get the minimum proposition power needed to create and maintain a proposal.
   *
   * @param  governor     Governor contract.
   * @param  blockNumber  Block number at which to check governance power.
   *
   * @return The minimum proposition power needed.
   */
  function getMinimumPropositionPowerNeeded(
    IDydxGovernor governor,
    uint256 blockNumber
  )
    public
    view
    override
    returns (uint256)
  {
    IGovernanceStrategy strategy = IGovernanceStrategy(governor.getGovernanceStrategy());
    return strategy
      .getTotalPropositionSupplyAt(blockNumber)
      .mul(PROPOSITION_THRESHOLD)
      .div(ONE_HUNDRED_WITH_PRECISION);
  }

  /**
   * @notice Check whether a proposal has succeeded.
   *
   *  A proposal has succeeded if the number of `for` votes is greater than the quorum threshold
   *  and the difference between `for` and `against` votes is greater than the vote differential
   *  threshold.
   *
   * @param  governor    Governor contract.
   * @param  proposalId  ID of the proposal to check.
   *
   * @return Boolean `true` if the proposal succeeded, otherwise `false`.
   */
  function isProposalPassed(
    IDydxGovernor governor,
    uint256 proposalId
  )
    external
    view
    override
    returns (bool)
  {
    return (
      isQuorumValid(governor, proposalId) &&
      isVoteDifferentialValid(governor, proposalId)
    );
  }

  /**
   * @notice Get the minimum voting power needed for a proposal to meet the quorum threshold.
   *
   * @param  votingSupply  The total supply of voting power.
   *
   * @return The number of votes required to meet the quorum threshold.
   */
  function getMinimumVotingPowerNeeded(
    uint256 votingSupply
  )
    public
    view
    override
    returns (uint256)
  {
    return votingSupply.mul(MINIMUM_QUORUM).div(ONE_HUNDRED_WITH_PRECISION);
  }

  /**
   * @notice Check whether a proposal has enough `for` votes to meet the quorum requirement.
   *
   * @param  governor    Governor contract.
   * @param  proposalId  ID of the proposal to check.
   *
   * @return Boolean `true` if the proposal meets the quorum requirement, otherwise `false`.
   */
  function isQuorumValid(
    IDydxGovernor governor,
    uint256 proposalId
  )
    public
    view
    override
    returns (bool)
  {
    IDydxGovernor.ProposalWithoutVotes memory proposal = governor.getProposalById(proposalId);
    uint256 votingSupply = IGovernanceStrategy(proposal.strategy).getTotalVotingSupplyAt(
      proposal.startBlock
    );

    return proposal.forVotes >= getMinimumVotingPowerNeeded(votingSupply);
  }

  /**
   * @notice Check whether a proposal meets the vote differential threshold requirement.
   *
   *  Requirement: forVotes - againstVotes > VOTE_DIFFERENTIAL * votingSupply
   *
   * @param  governor    Governor contract.
   * @param  proposalId  ID of the proposal to check.
   *
   * @return Boolean `true` if the proposal meets the differential requirement, otherwise `false`.
   */
  function isVoteDifferentialValid(
    IDydxGovernor governor,
    uint256 proposalId
  )
    public
    view
    override
    returns (bool)
  {
    IDydxGovernor.ProposalWithoutVotes memory proposal = governor.getProposalById(proposalId);
    uint256 votingSupply = IGovernanceStrategy(proposal.strategy).getTotalVotingSupplyAt(
      proposal.startBlock
    );

    return (
      proposal.forVotes.mul(ONE_HUNDRED_WITH_PRECISION).div(votingSupply) >
      proposal.againstVotes.mul(ONE_HUNDRED_WITH_PRECISION).div(votingSupply).add(VOTE_DIFFERENTIAL)
    );
  }
}
