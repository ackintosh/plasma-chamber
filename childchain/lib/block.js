const MerkleTree = require("merkletree").default;


class Block {
  
  constructor() {
    this.id = null;
    this.number = 0;
    this.hash = null;
    this.txs = [];
    this.txs_root = null;
    this.contracts_root = null;
    this.nonces_root = null;
  }

  appendTx(tx) {
    this.txs.push(tx);
  }

  createTxProof(tx) {
    const tree = MerkleTree(this.txs.map(tx=>tx.hash()));
    return tree.proof(tx.hash());
  }

  merkleHash() {
    const tree = MerkleTree(this.txs.map(tx=>tx.hash()));
    return tree.root();
  }

}

module.exports = Block