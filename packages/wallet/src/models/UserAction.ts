import { SignedTransactionWithProof } from '@layer2/core';

type UserActionType = 'deposit' | 'receive' | 'transfer' | 'exit'

export interface UserAction {
  type: UserActionType,
  amount: number,
  id: string,
  address: string | undefined,
  timestamp: number
}

export class UserActionUtil {
  
  static createSend(tx: SignedTransactionWithProof) {
    const transfer: UserActionType = 'transfer'
    return UserActionUtil.createTransfer(transfer, tx)
  }

  static createReceive(tx: SignedTransactionWithProof) {
    const receive: UserActionType = 'receive'
    return UserActionUtil.createTransfer(receive, tx)
  }

  static createTransfer(
    type: UserActionType,
    tx: SignedTransactionWithProof
  ) {
    let address
    if(type == 'transfer') {
      address = tx.getSignedTx().getStateUpdate(0).getOwner()
    } else if(type == 'receive') {
      address = tx.getOutput().getOwner()
    }
    return {
      type: type,
      amount: tx.getOutput().getSegment().getAmount().toNumber(),
      id: tx.getTxHash(),
      address: address,
      timestamp: tx.getTimestamp().toNumber()
    }
  }
  
}