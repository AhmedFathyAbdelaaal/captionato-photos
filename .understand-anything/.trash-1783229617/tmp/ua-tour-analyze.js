const fs = require('fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (e) {
  console.error('Failed to parse input:', e.message);
  process.exit(1);
}

const { nodes, edges, layers } = data;

// Build lookup maps
const nodeMap = {};
for (const n of nodes) nodeMap[n.id] = n;

// A. Fan-In (how many nodes point TO this node)
const fanIn = {};
const fanOut = {};
for (const n of nodes) { fanIn[n.id] = 0; fanOut[n.id] = 0; }

for (const e of edges) {
  if (fanIn[e.target] !== undefined) fanIn[e.target]++;
  if (fanOut[e.source] !== undefined) fanOut[e.source]++;
}

const fanInRanking = Object.entries(fanIn)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([id, fi]) => ({ id, fanIn: fi, name: nodeMap[id]?.name || id }));

const fanOutRanking = Object.entries(fanOut)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([id, fo]) => ({ id, fanOut: fo, name: nodeMap[id]?.name || id }));

// B. Entry Point Candidates
const entryFileNames = new Set([
  'index.ts','index.js','main.ts','main.js','app.ts','app.js',
  'server.ts','server.js','mod.rs','main.go','main.py','main.rs',
  'manage.py','app.py','wsgi.py','asgi.py','run.py','__main__.py',
  'Application.java','Main.java','Program.cs','config.ru','index.php',
  'App.swift','Application.kt','main.cpp','main.c'
]);

const totalNodes = nodes.length;
const fanInValues = Object.values(fanIn).sort((a, b) => a - b);
const fanOutValues = Object.values(fanOut).sort((a, b) => b - a);
const top10PctFanOut = fanOutValues[Math.floor(totalNodes * 0.1)] || 0;
const bottom25PctFanIn = fanInValues[Math.floor(totalNodes * 0.25)] || 0;

const entryScores = {};
for (const n of nodes) {
  let score = 0;
  if (n.type === 'document' && n.name === 'README.md' && n.filePath === 'README.md') {
    score += 5;
  } else if (n.type === 'document' && n.filePath && !n.filePath.includes('/') && n.name.endsWith('.md')) {
    score += 2;
  } else if (n.type === 'file') {
    if (entryFileNames.has(n.name)) score += 3;
    const depth = (n.filePath || '').split('/').length - 1;
    if (depth <= 1) score += 1;
    if (fanOut[n.id] >= top10PctFanOut) score += 1;
    if (fanIn[n.id] <= bottom25PctFanIn) score += 1;
  }
  entryScores[n.id] = score;
}

const entryPointCandidates = Object.entries(entryScores)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([id, score]) => ({ id, score, name: nodeMap[id]?.name || id, summary: nodeMap[id]?.summary || '' }));

// C. BFS from top CODE entry point
const topCodeEntry = entryPointCandidates.find(e => nodeMap[e.id]?.type === 'file');
const bfsStart = topCodeEntry ? topCodeEntry.id : null;

const bfsOrder = [];
const depthMap = {};
const byDepth = {};

if (bfsStart) {
  // Build adjacency for imports/calls
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if ((e.type === 'imports' || e.type === 'calls') && adj[e.source]) {
      adj[e.source].push(e.target);
    }
  }

  const visited = new Set();
  const queue = [{ id: bfsStart, depth: 0 }];
  visited.add(bfsStart);

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    bfsOrder.push(id);
    depthMap[id] = depth;
    if (!byDepth[depth]) byDepth[depth] = [];
    byDepth[depth].push(id);

    for (const neighbor of (adj[id] || [])) {
      if (!visited.has(neighbor) && nodeMap[neighbor]) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }
}

// D. Non-code files
const nonCodeFiles = { documentation: [], infrastructure: [], data: [], config: [] };
for (const n of nodes) {
  if (n.type === 'document') {
    nonCodeFiles.documentation.push({ id: n.id, name: n.name, summary: n.summary });
  } else if (['service','pipeline','resource'].includes(n.type)) {
    nonCodeFiles.infrastructure.push({ id: n.id, name: n.name, type: n.type, summary: n.summary });
  } else if (['table','schema','endpoint'].includes(n.type)) {
    nonCodeFiles.data.push({ id: n.id, name: n.name, type: n.type, summary: n.summary });
  } else if (n.type === 'config') {
    nonCodeFiles.config.push({ id: n.id, name: n.name, summary: n.summary });
  }
}

// E. Clusters (bidirectional edges)
const edgeSet = new Set();
for (const e of edges) edgeSet.add(`${e.source}|||${e.target}`);

const bidir = [];
const seen = new Set();
for (const e of edges) {
  const rev = `${e.target}|||${e.source}`;
  const key = [e.source, e.target].sort().join('|||');
  if (edgeSet.has(rev) && !seen.has(key)) {
    seen.add(key);
    bidir.push([e.source, e.target]);
  }
}

// Build clusters by expanding bidirectional pairs
const clusters = [];
for (const pair of bidir) {
  const cluster = new Set(pair);
  // Expand: add nodes connected to 2+ cluster members
  for (const n of nodes) {
    if (cluster.has(n.id)) continue;
    let connections = 0;
    for (const m of cluster) {
      if (edgeSet.has(`${n.id}|||${m}`) || edgeSet.has(`${m}|||${n.id}`)) connections++;
    }
    if (connections >= 2) cluster.add(n.id);
  }
  const clusterArr = Array.from(cluster);
  // Count edges within cluster
  let edgeCount = 0;
  for (const e of edges) {
    if (cluster.has(e.source) && cluster.has(e.target)) edgeCount++;
  }
  clusters.push({ nodes: clusterArr, edgeCount });
}

// Deduplicate clusters
const uniqueClusters = clusters
  .sort((a, b) => b.edgeCount - a.edgeCount)
  .slice(0, 10);

// F. Node summary index
const nodeSummaryIndex = {};
for (const n of nodes) {
  nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary || '' };
}

// G. Layer list
const layerList = {
  count: layers.length,
  list: layers.map(l => ({ id: l.id, name: l.name, description: l.description }))
};

const result = {
  scriptCompleted: true,
  entryPointCandidates,
  fanInRanking,
  fanOutRanking,
  bfsTraversal: {
    startNode: bfsStart,
    order: bfsOrder,
    depthMap,
    byDepth
  },
  nonCodeFiles,
  clusters: uniqueClusters,
  layers: layerList,
  nodeSummaryIndex,
  totalNodes: nodes.length,
  totalEdges: edges.length
};

try {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log('Done. Output written to', outputPath);
  process.exit(0);
} catch (e) {
  console.error('Failed to write output:', e.message);
  process.exit(1);
}
