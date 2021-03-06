import {
  Segment,
  StateManager,
  SegmentedBlock,
  SignedTransactionWithProof,
  ExclusionProof,
  StateUpdate,
  PredicatesManager
} from '@layer2/core';
import { WaitingBlockWrapper } from '../models';
import { IStorage } from '../storage';
import { PlasmaClient } from '../client';

export class PlasmaBlockHeader {
  deposit?: StateUpdate
  block?: WaitingBlockWrapper
  blkNum: number

  constructor(blkNum: number) {
    this.blkNum = blkNum
  }

  getBlkNum() {
    return this.blkNum
  }

  isDeposit(): boolean {
    return !!this.deposit
  }

  setDeposit(deposit: StateUpdate) {
    this.deposit = deposit
  }

  setBlock(block: WaitingBlockWrapper) {
    this.block = block
  }

  getDeposit(): StateUpdate {
    if(this.deposit) {
      return this.deposit
    } else {
      throw new Error('deposit not found')
    }
  }

  getBlock(): WaitingBlockWrapper {
    if(this.block) {
      return this.block
    } else {
      throw new Error('block not found')
    }
  }

  serialize() {
    if(this.block) {
      return ['B', this.block.serialize()]
    } else if(this.deposit) {
      return ['D', this.deposit.serialize()]
    } else {
      throw new Error('unknown type')
    }
  }

  static deserialize(blkNum: number, data: any[]) {
    const plasmaBlockHeader = new PlasmaBlockHeader(blkNum)
    if(data[0] == 'B') {
      plasmaBlockHeader.setBlock(WaitingBlockWrapper.deserialize(data[1]))
    } else if(data[0] == 'D') {
      plasmaBlockHeader.setDeposit(StateUpdate.deserialize(data[1]))
    } else {
      throw new Error('unknown type')
    }
    return plasmaBlockHeader
  }

  static CreateDeposit(blkNum: number, deposit: StateUpdate) {
    const plasmaBlockHeader = new PlasmaBlockHeader(blkNum)
    plasmaBlockHeader.setDeposit(deposit)
    return plasmaBlockHeader
  }

  static CreateTxBlock(block: WaitingBlockWrapper) {
    const plasmaBlockHeader = new PlasmaBlockHeader(block.blkNum.toNumber())
    plasmaBlockHeader.setBlock(block)
    return plasmaBlockHeader
  }
  
}

/**
 * The history of a segment
 */
export class SegmentHistory {
  key: string
  originalSegment: Segment
  storage: IStorage

  constructor(storage: IStorage, key: string, originalSegment: Segment) {
    this.key = key
    this.storage = storage
    this.originalSegment = originalSegment
  }

  getKey() {
    return this.key
  }

  async append(segmentedBlock: SegmentedBlock) {
    await this.storage.addProof(
      this.getKey(),
      segmentedBlock.getBlockNumber(),
      JSON.stringify(segmentedBlock.serialize())
    )
  }

  async getSegmentedBlock(blkNum: number) {
    const serialized = await this.storage.getProof(this.getKey(), blkNum)
    return SegmentedBlock.deserialize(JSON.parse(serialized))
  }

  async verify(
    segmentChecker: StateManager,
    blkNum: number,
    root: string
  ) {
    // check this.history[blkNum] is exclusion proof or parent of childTxs
    const segmentedBlock = await this.getSegmentedBlock(blkNum)
    const items = segmentedBlock.getItems()
    items.forEach((item) => {
      if(item instanceof SignedTransactionWithProof) {
        const tx = item as SignedTransactionWithProof
        // check inclusion check
        if(!(tx.getRoot() == root && tx.checkInclusion())) {
          throw new Error('invalid history: fail to check inclusion')
        }
        if(segmentChecker.isContain(tx.getSignedTx())) {
          segmentChecker.spend(tx.getSignedTx())
          segmentChecker.insert(tx.getSignedTx())
          // tx.getSignedTx().getStateUpdates().filter(s => s.getBlkNum().eq(blkNum))
        } else {
          throw new Error('invalid history')
        }
      } else if (item instanceof ExclusionProof) {
        const exclusionProof = item as ExclusionProof
        // check exclusion
        if(!(exclusionProof.getRoot() == root && exclusionProof.checkExclusion())) {
          throw new Error('invalid history: fail to check exclusion')
        }
      } else {
        throw new Error('invalid type')
      }
    })
    return true
  }

}

/**
 * The manager for multiple segments history
 */
export class SegmentHistoryManager {

  segmentHistoryMap: {[key: string]: SegmentHistory} = {}
  blockHeaders: WaitingBlockWrapper[]
  storage: IStorage
  client: PlasmaClient
  predicatesManager: PredicatesManager

  constructor(storage: IStorage, client: PlasmaClient, predicatesManager: PredicatesManager) {
    this.storage = storage
    this.client = client
    this.blockHeaders = []
    this.predicatesManager = predicatesManager
  }

  init(key: string, originalSegment: Segment) {
    this.segmentHistoryMap[key] = new SegmentHistory(this.storage, key, originalSegment)
  }

  appendDeposit(deposit: StateUpdate) {
    this.storage.addBlockHeader(
      deposit.getBlkNum().toNumber(),
      JSON.stringify(PlasmaBlockHeader.CreateDeposit(deposit.getBlkNum().toNumber(), deposit).serialize()))
  }

  async appendSegmentedBlock(key: string, segmentedBlock: SegmentedBlock) {
    if(!this.segmentHistoryMap[key]) {
      this.init(key, segmentedBlock.getOriginalSegment())
    }
    await this.segmentHistoryMap[key].append(segmentedBlock)
  }

  async appendBlockHeader(header: WaitingBlockWrapper) {
    this.blockHeaders.push(header)
    await this.storage.addBlockHeader(header.blkNum.toNumber(), JSON.stringify(PlasmaBlockHeader.CreateTxBlock(header).serialize()))
  }

  async loadBlockHeaders(fromBlkNum: number, toBlkNum: number) {
    const serialized = await this.storage.searchBlockHeader(fromBlkNum, toBlkNum)
    return serialized.map((s: any) => PlasmaBlockHeader.deserialize(s.blkNum, JSON.parse(s.value)))
  }

  async verifyHistory(key: string) {
    const segmentChecker = new StateManager(this.predicatesManager)
    return await this.loadAndVerify(segmentChecker, key, 0)
  }

  private async loadAndVerify(
    segmentChecker: StateManager,
    key: string,
    fromBlkNum: number
  ): Promise<StateUpdate[]> {
    // check segment history by this.blockHeaders
    const blockHeaders = await this.loadBlockHeaders(fromBlkNum, fromBlkNum + 100)
    if(blockHeaders.length > 0) {
      await this.verifyPart(segmentChecker, key, blockHeaders)
      return this.loadAndVerify(segmentChecker, key, fromBlkNum + 100)
    } else {
      return segmentChecker.getStateUpdates()
    }
  }

  private async verifyPart(
    segmentChecker: StateManager,
    key: string,
    blockHeaders: PlasmaBlockHeader[]
  ): Promise<StateUpdate[]> {
    const blockHeader = blockHeaders.shift()
    if(blockHeader) {
      if(blockHeader.isDeposit()) {
        await this.verifyDeposit(segmentChecker, blockHeader.getBlkNum(), blockHeader.getDeposit())
      } else {
        await this.verifyBlock(segmentChecker, key, blockHeader.getBlock(), 2)
      }
      return await this.verifyPart(
        segmentChecker,
        key,
        blockHeaders)
    } else {
      return segmentChecker.getStateUpdates()
    }
  }

  private async verifyDeposit(
    segmentChecker: StateManager,
    blkNum: number,
    deposit: StateUpdate
  ) {
    segmentChecker.insertDepositTx(deposit)
  }

  private async verifyBlock(
    segmentChecker: StateManager,
    key: string,
    blockHeader: WaitingBlockWrapper,
    retryCounter: number
  ) {
    const blkNum = blockHeader.blkNum.toNumber()
    try {
      await this.segmentHistoryMap[key].verify(
        segmentChecker,
        blkNum,
        blockHeader.root)
    } catch(e) {
      if(e.message === 'invalid history') {
        throw e
      }
      console.warn(e)
      const result = await this.client.getBlock(blkNum)
      if(result.isOk() && retryCounter >= 0) {
        const segmentedBlock = result.ok().getSegmentedBlock(this.segmentHistoryMap[key].originalSegment)
        this.appendSegmentedBlock(key, segmentedBlock)
        // retry
        await this.verifyBlock(
          segmentChecker,
          key,
          blockHeader,
          retryCounter - 1)
      }
    }
  }


}
