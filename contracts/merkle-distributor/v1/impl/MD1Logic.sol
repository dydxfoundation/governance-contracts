pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import { SafeERC20 } from '../../../dependencies/open-zeppelin/SafeERC20.sol';
import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { MerkleProof } from '../../../dependencies/open-zeppelin/MerkleProof.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import {MD1Types} from '../lib/MD1Types.sol';
import {MD1Pausable} from './MD1Pausable.sol';

/**
 * @title MD1Logic
 * @author dYdX
 *
 * @notice Implements the main features of the Merkle distributor contract.
 */
abstract contract MD1Logic is MD1Pausable {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice The waiting period before a proposed Merkle root can become active, in seconds.
  uint256 public constant WAITING_PERIOD = 7 days;

  /// @notice The token distributed as rewards.
  IERC20 public immutable REWARDS_TOKEN;

  /// @notice Address to pull rewards from. Must have provided an allowance to this contract.
  address public immutable REWARDS_VAULT;

  // ============ Events ============

  /// @notice Emitted when a user claims rewards.
  event RewardsClaimed(address account, uint256 amount);

  /// @notice Emitted when a new Merkle root is proposed and the waiting period begins.
  event RootProposed(bytes32 merkleRoot, bytes32 ipfsCid, uint256 epoch, uint256 waitingPeriodEnd);

  /// @notice Emitted when a new Merkle root becomes active.
  event RootUpdated(bytes32 merkleRoot, bytes32 ipfsCid, uint256 epoch);

  // ============ Constructor ============

  constructor(address rewardsToken, address rewardsVault) {
    REWARDS_TOKEN = IERC20(rewardsToken);
    REWARDS_VAULT = rewardsVault;
  }

  // ============ External Functions ============

  /**
   * @notice Set the proposed root parameters to the values returned by the oracle, and starts
   *  the waiting period. Anyone may call this function.
   *
   *  Reverts if the oracle root is bytes32(0).
   *  Reverts if the oracle root parameters are equal to the proposed root parameters.
   *  Reverts if the oracle root epoch is not equal to the next root epoch.
   */
  function proposeRoot()
    external
    nonReentrant
  {
    // Read the latest values from the oracle.
    (
      bytes32 merkleRoot,
      bytes32 ipfsCid,
      uint256 epoch
    ) = _REWARDS_ORACLE_.read();

    require(merkleRoot != bytes32(0), "MD1Logic: Oracle root is zero");
    require(
      (
        merkleRoot != _PROPOSED_ROOT_.merkleRoot ||
        ipfsCid != _PROPOSED_ROOT_.ipfsCid ||
        epoch != _PROPOSED_ROOT_.epoch
      ),
      "MD1Logic: Oracle root was already proposed"
    );
    require(epoch == getNextRootEpoch(), "MD1Logic: Oracle epoch is not next root epoch");

    _PROPOSED_ROOT_ = MD1Types.MerkleRoot({
      merkleRoot: merkleRoot,
      ipfsCid: ipfsCid,
      epoch: epoch
    });
    uint256 waitingPeriodEnd = block.timestamp.add(WAITING_PERIOD);
    _WAITING_PERIOD_END_ = waitingPeriodEnd;

    emit RootProposed(merkleRoot, ipfsCid, epoch, waitingPeriodEnd);
  }

  /**
   * @notice Set the active root parameters to the proposed values.
   *
   *  Reverts if root updates are paused.
   *  Reverts if the proposed root is bytes32(0).
   *  Reverts if the proposed root epoch is not equal to the next root epoch.
   *  Reverts if the waiting period for the proposed root has not elapsed.
   */
  function updateRoot()
    external
    nonReentrant
    whenNotPaused
  {
    // Get the proposed parameters.
    bytes32 merkleRoot = _PROPOSED_ROOT_.merkleRoot;
    bytes32 ipfsCid = _PROPOSED_ROOT_.ipfsCid;
    uint256 epoch = _PROPOSED_ROOT_.epoch;

    require(merkleRoot != bytes32(0), "MD1Logic: Proposed root is zero");
    require(epoch == getNextRootEpoch(), "MD1Logic: Proposed epoch is not next root epoch");
    require(block.timestamp >= _WAITING_PERIOD_END_, "MD1Logic: Waiting period has not elapsed");

    _ACTIVE_ROOT_.merkleRoot = merkleRoot;
    _ACTIVE_ROOT_.ipfsCid = ipfsCid;
    _ACTIVE_ROOT_.epoch = epoch;

    emit RootUpdated(merkleRoot, ipfsCid, epoch);
  }

  /**
   * @notice Claim the remaining unclaimed rewards for a user.
   *
   *  Reverts if the Merkle proof is invalid.
   *
   * @param  user              Address of the user.
   * @param  cumulativeAmount  The total rewards this user has earned.
   * @param  merkleProof       The Merkle proof for the user and cumulative amount.
   *
   * @return The number of rewards tokens claimed.
   */
  function claimRewards(
    address user,
    uint256 cumulativeAmount,
    bytes32[] calldata merkleProof
  )
    external
    nonReentrant
    returns (uint256)
  {
    // Get the active Merkle root.
    bytes32 merkleRoot = _ACTIVE_ROOT_.merkleRoot;

    // Verify the Merkle proof.
    bytes32 node = keccak256(abi.encodePacked(user, cumulativeAmount));
    require(MerkleProof.verify(merkleProof, merkleRoot, node), 'MD1Logic: Invalid Merkle proof');

    // Get the claimable amount.
    uint256 claimable = cumulativeAmount.sub(_CLAIMED_[user]);

    if (claimable == 0) {
      return 0;
    }

    // Mark the user as having claimed the full amount.
    _CLAIMED_[user] = cumulativeAmount;

    // Send the user the claimable amount.
    REWARDS_TOKEN.safeTransferFrom(REWARDS_VAULT, user, claimable);

    emit RewardsClaimed(user, claimable);

    return claimable;
  }

  /**
   * @notice Returns true if there is a proposed root waiting to become active, and the waiting
   *  period for that root has elapsed.
   */
  function canUpdateRoot()
    external
    view
    returns (bool)
  {
    return hasPendingRoot() && block.timestamp >= _WAITING_PERIOD_END_;
  }

  // ============ Public Functions ============

  /**
   * @notice Returns true if there is a proposed root waiting to become active. This is the case if
   *  and only if the proposed root is not zero and the proposed root epoch is equal to the next
   *  root epoch.
   */
  function hasPendingRoot()
    public
    view
    returns (bool)
  {
    // Get the proposed parameters.
    bytes32 merkleRoot = _PROPOSED_ROOT_.merkleRoot;
    uint256 epoch = _PROPOSED_ROOT_.epoch;

    if (merkleRoot == bytes32(0)) {
      return false;
    }
    return epoch == getNextRootEpoch();
  }

  /**
   * @notice Get the next root epoch. If the active root is zero, then the next root epoch is zero,
   *  otherwise, it is equal to the active root epoch plus one.
   */
  function getNextRootEpoch()
    public
    view
    returns (uint256)
  {
    // Get the active parameters.
    bytes32 merkleRoot = _ACTIVE_ROOT_.merkleRoot;
    uint256 epoch = _ACTIVE_ROOT_.epoch;

    if (merkleRoot == bytes32(0)) {
      return 0;
    }
    return epoch.add(1);
  }
}
