const Chain = require("./chain");
const Block = require("./block");
const Snapshot = require("./state/snapshot")
const levelup = require('levelup');
const leveldown = require('leveldown');

module.exports = {
    run: async _=>{
        const blockDB = levelup(leveldown('./.blockdb'));
        const metaDB = levelup(leveldown('./.metadb'));
        const snapshotDB = levelup(leveldown('./.snapshotdb'));
        const childChain = new Chain();
        childChain.setMetaDB(metaDB);
        childChain.setBlockDB(blockDB);

        //DEBUG for making initial DB
        // childChain.blockHeight = 1;
        // await childChain.saveBlockHeight()
        // await childChain.saveBlock(new Block())
        // await childChain.saveCommitmentTxs()

        const snapshot = new Snapshot();
        snapshot.setDB(snapshotDB);
        childChain.setSnapshot(snapshot);
        await childChain.setChainID("NKJ23H3213WHKHSAL");
        await childChain.resume();
        return childChain;
    }
}