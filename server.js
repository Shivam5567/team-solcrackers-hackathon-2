// server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const Blockchain = require("./blockchain");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const tenderChain = new Blockchain();

// Helper: create stages array
function createStages(count, budget) {
  const amount = Number(budget) / count;
  return Array.from({ length: count }, (_, i) => ({
    stage: i + 1,
    status: "pending",     // pending | submitted | approved | failed
    payment: Number(amount.toFixed(2)),
    submittedAt: null,
    submittedBy: null,
    approvedAt: null,
    deadline: null         // will set per-stage deadline when tender closed
  }));
}

// POST /tender  (government opens tender)
app.post("/tender", (req, res) => {
  const { title, description, budget, totalStages = 5, stageDurationDays = 7 } = req.body;

  if (!title || !budget) return res.status(400).json({ error: "title and budget required" });

  const tender = {
    type: "tender",
    id: Date.now().toString(),
    title,
    description: description || "",
    budget: Number(budget),
    totalStages: Number(totalStages),
    stageDurationDays: Number(stageDurationDays), // duration per stage in days
    stages: createStages(Number(totalStages), Number(budget)),
    status: "open", // open | in_progress | closed | reopened
    createdAt: Date.now(),
    winner: null,
    currentStage: 0 // 0 means not started
  };

  tenderChain.addBlock(tender);
  res.json({ message: "Tender created by Government", tender });
});

// POST /bid
app.post("/bid", (req, res) => {
  const { tenderId, bidderName, amount } = req.body;
  if (!tenderId || !bidderName || !amount) return res.status(400).json({ error: "tenderId, bidderName, amount required" });

  const tenderBlock = tenderChain.findTenderBlock(tenderId);
  if (!tenderBlock) return res.status(404).json({ error: "Tender not found" });

  if (tenderBlock.data.status !== "open" && tenderBlock.data.status !== "reopened") {
    return res.status(400).json({ error: "Tender not accepting bids" });
  }

  const bid = {
    type: "bid",
    tenderId,
    bidderName,
    amount: Number(amount),
    timestamp: Date.now()
  };

  // record bid as separate block
  tenderChain.addBlock(bid);

  // also stash bid inside tender block data for convenience and persistence
  tenderBlock.data.bids = tenderBlock.data.bids || [];
  tenderBlock.data.bids.push({ bidderName, amount: Number(amount), timestamp: Date.now() });
  tenderChain._saveToFile();

  res.json({ message: "Bid submitted", bid });
});

// POST /close/:tenderId  (Government closes bidding and selects winner)
app.post("/close/:tenderId", (req, res) => {
  const { tenderId } = req.params;
  const tenderBlock = tenderChain.findTenderBlock(tenderId);
  if (!tenderBlock) return res.status(404).json({ error: "Tender not found" });

  const bids = tenderBlock.data.bids || [];
  if (bids.length === 0) return res.status(400).json({ error: "No bids to choose from" });

  // Random winner (changeable to ranking logic)
  const winner = bids[Math.floor(Math.random() * bids.length)];

  tenderBlock.data.winner = winner;
  tenderBlock.data.status = "in_progress";
  tenderBlock.data.currentStage = 1;
  // set deadline for stage 1
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  for (let i = 0; i < tenderBlock.data.totalStages; i++) {
    tenderBlock.data.stages[i].deadline = now + (i + 1) * tenderBlock.data.stageDurationDays * msPerDay;
  }
  tenderChain.addBlock({
    type: "result",
    tenderId,
    winner,
    startedAt: now
  });

  // persist modified tender
  tenderChain._saveToFile();

  res.json({ message: "Tender closed, winner selected", winner });
});

// POST /submit-work/:tenderId
// Winner submits work for the current stage
app.post("/submit-work/:tenderId", (req, res) => {
  const { tenderId } = req.params;
  const { bidderName, stage, description, link } = req.body;
  if (!bidderName || !stage) return res.status(400).json({ error: "bidderName and stage required" });

  const tenderBlock = tenderChain.findTenderBlock(tenderId);
  if (!tenderBlock) return res.status(404).json({ error: "Tender not found" });

  if (!tenderBlock.data.winner || tenderBlock.data.winner.bidderName !== bidderName) {
    return res.status(403).json({ error: "Only the winner can submit work" });
  }

  const stageObj = tenderBlock.data.stages.find(s => s.stage === Number(stage));
  if (!stageObj) return res.status(400).json({ error: "Stage not found" });
  if (stageObj.status !== "pending") return res.status(400).json({ error: "Stage not in pending state" });

  // record submission as a block
  const submission = {
    type: "work_submission",
    tenderId,
    bidderName,
    stage: Number(stage),
    description: description || "",
    link: link || "",
    timestamp: Date.now()
  };

  tenderChain.addBlock(submission);

  // mark stage as submitted
  stageObj.status = "submitted";
  stageObj.submittedAt = Date.now();
  stageObj.submittedBy = bidderName;

  tenderChain._saveToFile();
  res.json({ message: `Stage ${stage} submitted for review` });
});

// POST /approve-stage/:tenderId
// Government approves submitted stage to release payment
app.post("/approve-stage/:tenderId", (req, res) => {
  const { tenderId } = req.params;
  const { stage } = req.body;
  if (!stage) return res.status(400).json({ error: "stage is required" });

  const tenderBlock = tenderChain.findTenderBlock(tenderId);
  if (!tenderBlock) return res.status(404).json({ error: "Tender not found" });

  const stageObj = tenderBlock.data.stages.find(s => s.stage === Number(stage));
  if (!stageObj) return res.status(400).json({ error: "Stage not found" });
  if (stageObj.status !== "submitted") return res.status(400).json({ error: "Stage not submitted" });

  // release payment (simulation)
  stageObj.status = "approved";
  stageObj.approvedAt = Date.now();

  // record payment release as block
  tenderChain.addBlock({
    type: "payment_release",
    tenderId,
    stage: Number(stage),
    amountReleased: stageObj.payment,
    releasedAt: stageObj.approvedAt,
    beneficiary: tenderBlock.data.winner
  });

  // move to next stage or close
  if (Number(stage) >= tenderBlock.data.totalStages) {
    tenderBlock.data.status = "closed";
    tenderBlock.data.currentStage = tenderBlock.data.totalStages;
    tenderChain.addBlock({ type: "tender_completed", tenderId, completedAt: Date.now() });
  } else {
    tenderBlock.data.currentStage = Number(stage) + 1;
  }

  tenderChain._saveToFile();
  res.json({ message: `Stage ${stage} approved and payment released`, stage: stageObj });
});

// GET /tenders
app.get("/tenders", (req, res) => {
  const tenders = tenderChain.chain
    .filter(b => b.data && b.data.type === "tender")
    .map(b => b.data);
  res.json(tenders);
});

// GET /bids/:tenderId
app.get("/bids/:tenderId", (req, res) => {
  const tenderBlock = tenderChain.findTenderBlock(req.params.tenderId);
  if (!tenderBlock) return res.status(404).json({ error: "Tender not found" });
  res.json(tenderBlock.data.bids || []);
});

// GET /chain
app.get("/chain", (req, res) => {
  res.json(tenderChain.chain);
});

// POST /check-deadlines
// This checks all in-progress tenders for stage deadlines and reopens if missed
app.post("/check-deadlines", (req, res) => {
  const now = Date.now();
  const reopened = [];

  tenderChain.chain.forEach(block => {
    if (!block.data || block.data.type !== "tender") return;
    const tender = block.data;
    if (tender.status !== "in_progress") return;

    // get current stage (first pending or submitted stage)
    const currentStageIndex = tender.stages.findIndex(s => s.status === "pending" || s.status === "submitted");
    if (currentStageIndex === -1) return; // already done

    const s = tender.stages[currentStageIndex];
    if (s.deadline && now > s.deadline) {
      // stage missed -> reopen tender for remaining stages
      tender.status = "reopened";
      tender.winner = null;
      tender.currentStage = currentStageIndex + 1; // stage at which it failed
      tenderChain.addBlock({
        type: "reopen",
        tenderId: tender.id,
        failedStage: s.stage,
        reason: "missed deadline",
        timestamp: now
      });
      reopened.push({ tenderId: tender.id, failedStage: s.stage });
    }
  });

  tenderChain._saveToFile();
  res.json({ message: "Deadline check complete", reopened });
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
