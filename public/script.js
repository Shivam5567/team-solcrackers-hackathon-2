// public/script.js
const API = location.origin;

async function createTender() {
  const title = document.getElementById("t-title").value;
  const description = document.getElementById("t-desc").value;
  const budget = document.getElementById("t-budget").value;
  const totalStages = document.getElementById("t-stages").value || 5;
  const stageDurationDays = document.getElementById("t-stage-days").value || 7;

  if (!title || !budget) return alert("Title and budget required.");
  const res = await fetch(`${API}/tender`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, budget, totalStages, stageDurationDays })
  });
  const data = await res.json();
  alert(data.message || "Tender created");
  loadTenders();
}

async function loadTenders() {
  const res = await fetch(`${API}/tenders`);
  const tenders = await res.json();
  const container = document.getElementById("tenders");
  container.innerHTML = "";
  if (!tenders.length) container.innerHTML = "<div class='small'>No tenders found.</div>";

  tenders.forEach(t => {
    const div = document.createElement("div");
    div.className = "tender";
    div.innerHTML = `
      <h4>${t.title} <span class="small">[${t.status}]</span></h4>
      <div class="small">ID: ${t.id} | Budget: $${t.budget} | Stages: ${t.totalStages}</div>
      <p>${t.description}</p>
      <div><b>Winner:</b> ${t.winner ? t.winner.bidderName + " ($" + t.winner.amount + ")" : "Not selected"}</div>
      <div><b>Current Stage:</b> ${t.currentStage || "Not started"}</div>
      <div><b>Bids:</b> ${ (t.bids || []).map(b => `${b.bidderName} ($${b.amount})`).join(", ") || "No bids" }</div>
      <div style="margin-top:8px">${renderActions(t)}</div>
      <div style="margin-top:8px"><b>Stages Progress:</b> ${renderStages(t.stages)}</div>
    `;
    container.appendChild(div);
  });
}

function renderStages(stages) {
  if (!stages) return "N/A";
  return stages.map(s => `S${s.stage}:${s.status}`).join(" | ");
}

function renderActions(tender) {
  const id = tender.id;
  let s = `
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <div style="width:200px">
        <input id="bidder-${id}" placeholder="Your company name" />
        <input id="bid-amount-${id}" type="number" placeholder="Bid amount" />
        <button onclick="submitBid('${id}')">Submit Bid</button>
      </div>
  `;

  if (tender.status === "open" || tender.status === "reopened") {
    s += `<button onclick="closeTender('${id}')">Close Tender & Select Winner (Gov)</button>`;
  }

  if (tender.status === "in_progress" && tender.winner) {
    // show submit form for winner
    s += `
      <div style="width:300px">
        <input id="submit-name-${id}" placeholder="Winner name (for submit)" />
        <input id="submit-stage-${id}" type="number" placeholder="Stage number" />
        <input id="submit-link-${id}" placeholder="Link to prototype (optional)" />
        <textarea id="submit-desc-${id}" placeholder="Short description"></textarea>
        <button onclick="submitWork('${id}')">Submit Work (Winner)</button>
      </div>
      <div style="width:200px">
        <input id="approve-stage-${id}" placeholder="Stage to approve"/>
        <button onclick="approveStage('${id}')">Approve Stage (Gov)</button>
      </div>
    `;
  }
  s += `</div>`;
  return s;
}

async function submitBid(tenderId) {
  const bidderName = document.getElementById(`bidder-${tenderId}`).value;
  const amount = document.getElementById(`bid-amount-${tenderId}`).value;
  if (!bidderName || !amount) return alert("Enter bidder name and amount");
  const res = await fetch(`${API}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenderId, bidderName, amount })
  });
  const data = await res.json();
  if (data.error) alert(data.error); else { alert("Bid submitted"); loadTenders(); }
}

async function closeTender(tenderId) {
  if (!confirm("Government: close this tender and select a winner?")) return;
  const res = await fetch(`${API}/close/${tenderId}`, { method: "POST" });
  const data = await res.json();
  if (data.error) alert(data.error); else { alert("Winner: " + JSON.stringify(data.winner)); loadTenders(); }
}

async function submitWork(tenderId) {
  const bidderName = document.getElementById(`submit-name-${tenderId}`).value;
  const stage = document.getElementById(`submit-stage-${tenderId}`).value;
  const description = document.getElementById(`submit-desc-${tenderId}`).value;
  const link = document.getElementById(`submit-link-${tenderId}`).value;
  if (!bidderName || !stage) return alert("Enter your name and stage number");
  const res = await fetch(`${API}/submit-work/${tenderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bidderName, stage, description, link })
  });
  const data = await res.json();
  if (data.error) alert(data.error); else { alert(data.message); loadTenders(); }
}

async function approveStage(tenderId) {
  const stage = document.getElementById(`approve-stage-${tenderId}`).value;
  if (!stage) return alert("Enter stage number to approve");
  const res = await fetch(`${API}/approve-stage/${tenderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage })
  });
  const data = await res.json();
  if (data.error) alert(data.error); else { alert(data.message); loadTenders(); }
}

async function checkDeadlines() {
  const res = await fetch(`${API}/check-deadlines`, { method: "POST" });
  const data = await res.json();
  alert("Deadline check done. reopened: " + JSON.stringify(data.reopened));
  loadTenders();
}

async function viewChain() {
  const res = await fetch(`${API}/chain`);
  const chain = await res.json();
  console.log("Full chain:", chain);
  alert("Full chain logged to console");
}

loadTenders();
