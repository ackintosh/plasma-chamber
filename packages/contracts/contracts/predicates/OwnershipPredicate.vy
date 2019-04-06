#
# Library
#

contract VerifierUtil():
  def ecrecoverSig(
    _txHash: bytes32,
    _sig: bytes[260],
    index: int128
  ) -> address: constant
  def parseSegment(
    segment: uint256
  ) -> (uint256, uint256, uint256): constant
  def isContainSegment(
    segment: uint256,
    small: uint256
  ) -> (bool): constant

verifierUtil: public(address)

# @dev Constructor
@public
def __init__(_verifierUtil: address):
  self.verifierUtil = _verifierUtil

@public
@constant
def decodeState(
  stateBytes: bytes[256]
) -> (uint256, uint256):
  # assert self == extract32(stateBytes, 0, type=address)
  return (
    extract32(stateBytes, 32*1, type=uint256),  # blkNum
    extract32(stateBytes, 32*2, type=uint256)   # segment
  )

@public
@constant
def decodeOwnershipState(
  stateBytes: bytes[256]
) -> (uint256, uint256, address):
  # assert self == extract32(stateBytes, 0, type=address)
  return (
    extract32(stateBytes, 32*1, type=uint256),  # blkNum
    extract32(stateBytes, 32*2, type=uint256),  # segment
    extract32(stateBytes, 32*3, type=address)   # owner
  )

@public
@constant
def canInitiateExit(
  _txHash: bytes32,
  _stateUpdate: bytes[256],
  _owner: address,
  _segment: uint256
) -> (bool):
  blkNum: uint256
  segment: uint256
  owner: address
  (blkNum, segment, owner) = self.decodeOwnershipState(_stateUpdate)
  if _owner != ZERO_ADDRESS:
    assert _owner == owner
  assert VerifierUtil(self.verifierUtil).isContainSegment(segment, _segment)
  return True

@public
@constant
def verifyDeprecation(
  _txHash: bytes32,
  _stateBytes: bytes[256],
  _nextStateUpdate: bytes[256],
  _transactionWitness: bytes[65],
  _timestamp: uint256
) -> (bool):
  previousBlkNum: uint256
  exitSegment: uint256
  exitOwner: address
  challengeSegment: uint256
  challengeBlkNum: uint256
  (previousBlkNum, exitSegment, exitOwner) = self.decodeOwnershipState(_stateBytes)
  (challengeBlkNum, challengeSegment) = self.decodeState(_nextStateUpdate)
  assert VerifierUtil(self.verifierUtil).isContainSegment(exitSegment, challengeSegment)
  assert VerifierUtil(self.verifierUtil).ecrecoverSig(_txHash, _transactionWitness, 0) == exitOwner
  return True
