// blockchain.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class Block {
  constructor(index, timestamp, data, previousHash = "") {
    this.index = index;
    this.timestamp = timestamp;
    this.data = data; // arbitrary object (tender, bid, submission, etc.)
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    const blockString = `${this.index}${this.timestamp}${JSON.stringify(this.data)}${this.previousHash}${this.nonce}`;
    return crypto.createHash("sha256").update(blockString).digest("hex");
  }
}

class Blockchain {
  constructor(filePath = path.join(__dirname, "data.json")) {
    this.filePath = filePath;
    this.chain = this._loadFromFile() || [this._createGenesisBlock()];
  }

  _createGenesisBlock() {
    return new Block(0, Date.now(), { type: "genesis", message: "Genesis Block" }, "0");
  }

  _rebuildChain(rawChain) {
    // Convert plain objects (from JSON) back into Block instances
    return rawChain.map(blockObj => {
      const blk = new Block(blockObj.index, blockObj.timestamp, blockObj.data, blockObj.previousHash);
      blk.nonce = blockObj.nonce || 0;
      // Keep stored hash to preserve chain (calculateHash used for validation)
      blk.hash = blockObj.hash;
      return blk;
    });
  }

  _loadFromFile() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return this._rebuildChain(parsed);
      } catch (err) {
        console.error("Failed to load blockchain from file:", err);
        return null;
      }
    }
    return null;
  }

  _saveToFile() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.chain, null, 2));
    } catch (err) {
      console.error("Failed to save blockchain to file:", err);
    }
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(data) {
    const prev = this.getLatestBlock();
    const newBlock = new Block(this.chain.length, Date.now(), data, prev.hash);
    // optional: could add PoW here by incrementing nonce until hash meets difficulty
    newBlock.hash = newBlock.calculateHash();
    this.chain.push(newBlock);
    this._saveToFile();
    return newBlock;
  }

  isValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      if (current.hash !== current.calculateHash()) {
        return { valid: false, reason: `Hash mismatch at index ${i}` };
      }
      if (current.previousHash !== previous.hash) {
        return { valid: false, reason: `Previous hash mismatch at index ${i}` };
      }
    }
    return { valid: true };
  }

  // Utility: find tender block and return the block instance
  findTenderBlock(tenderId) {
    return this.chain.find(b => b.data && b.data.type === "tender" && b.data.id === tenderId);
  }
}

module.exports = Blockchain;
