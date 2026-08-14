const vscode = acquireVsCodeApi();
const canvas = document.querySelector("#graph");
const context = canvas.getContext("2d");
const controls = Object.fromEntries(
  [...document.querySelectorAll("input")].map((input) => [input.id, input]),
);

const defaults = {
  existing: false,
  orphans: true,
  labels: true,
  arrows: false,
  nodeSize: 100,
  linkWidth: 100,
  centerForce: 28,
  repelForce: 85,
  linkForce: 45,
  linkDistance: 100,
};

let nodes = [],
  edges = [],
  simulation,
  zoomHandler,
  hoverId = null,
  viewport = { x: 0, y: 0, k: 1 },
  dragStartX,
  dragStartY;

function option(name) {
  const control = controls[name];
  return control.type === "checkbox" ? control.checked : Number(control.value);
}

function resize() {
  const ratio = devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * ratio);
  canvas.height = Math.floor(canvas.clientHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (simulation) simulation.alpha(0.3).restart();
}

function getColor(folder) {
  if (!folder) return "#7961e8";
  let hash = 0;
  for (let i = 0; i < folder.length; i++) {
    hash = folder.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.clearRect(0, 0, width, height);

  context.save();
  context.translate(viewport.x, viewport.y);
  context.scale(viewport.k, viewport.k);

  const searchVal = controls.search.value.toLowerCase();
  const related = hoverId ? new Set([hoverId, ...edges.filter(e => e.source.id === hoverId || e.target.id === hoverId).flatMap(e => [e.source.id, e.target.id])]) : null;

  // Draw Edges
  context.lineWidth = option("linkWidth") / 100;
  context.strokeStyle = "#7c8b98";

  edges.forEach(edge => {
    const source = edge.source;
    const target = edge.target;

    const isVisible = (!option("existing") || (!source.missing && !target.missing)) &&
                      (!controls.search.value || (source.label.toLowerCase().includes(searchVal) || target.label.toLowerCase().includes(searchVal)));

    if (!isVisible) return;

    context.globalAlpha = related ? (related.has(source.id) && related.has(target.id) ? 0.6 : 0.1) : 0.42;
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.stroke();
  });

  // Draw Nodes
  nodes.forEach(node => {
    const isVisible = (!option("existing") || !node.missing) &&
                      (option("orphans") || (edges.some(e => e.source.id === node.id || e.target.id === node.id))) &&
                      (!controls.search.value || node.label.toLowerCase().includes(searchVal));

    if (!isVisible) return;

    const active = related?.has(node.id);
    const faded = related && !active;
    const radius = ((5 + Math.min(12, Math.sqrt(edges.filter(e => e.source.id === node.id || e.target.id === node.id).length) * 3)) * option("nodeSize")) / 100;

    context.globalAlpha = faded ? 0.12 : 1;
    context.fillStyle = node.missing ? "#767676" : (active ? "#ffffff" : getColor(node.folder));
    context.strokeStyle = active ? "#ffffff" : "#c8bdff";
    context.lineWidth = active ? 2 : 1;

    context.beginPath();
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (option("labels") && viewport.k > 0.45) {
      context.fillStyle = getComputedStyle(document.body).color;
      context.font = `${Math.max(10, 11 * viewport.k)}px var(--vscode-font-family)`;
      context.fillText(node.label, node.x + radius + 4, node.y + 4);
    }
  });

  context.restore();
  context.globalAlpha = 1;
}

function initSimulation(graphData) {
  if (simulation) simulation.stop();

  nodes = graphData.nodes.map(n => ({ ...n }));
  edges = graphData.edges.map(e => ({ ...e }));

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  edges.forEach(e => {
    e.source = nodeById.get(e.source);
    e.target = nodeById.get(e.target);
  });

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(d => d.id).distance(option("linkDistance")))
    .force("charge", d3.forceManyBody().strength(-option("repelForce") * 10))
    .force("center", d3.forceCenter(canvas.clientWidth / 2, canvas.clientHeight / 2).strength(option("centerForce") / 100))
    .force("collide", d3.forceCollide().radius(d => ((10 + Math.sqrt(edges.filter(e => e.source.id === d.id || e.target.id === d.id).length) * 3) * option("nodeSize")) / 100))
    .on("tick", draw);

  // Zoom setup
  zoomHandler = d3.zoom()
    .scaleExtent([0.2, 4])
    .filter(event => {
      const x = (event.offsetX - viewport.x) / viewport.k;
      const y = (event.offsetY - viewport.y) / viewport.k;
      return !nodes.find(n => Math.hypot(n.x - x, n.y - y) < 20);
    })
    .on("zoom", (event) => {
      viewport = event.transform;
      draw();
    });

  d3.select(canvas).call(zoomHandler);

  // Drag setup
  d3.select(canvas).call(d3.drag()
    .container(canvas)
    .subject(event => {
      const x = (event.x - viewport.x) / viewport.k;
      const y = (event.y - viewport.y) / viewport.k;
      return nodes.find(n => Math.hypot(n.x - x, n.y - y) < 20);
    })
    .on("start", event => {
      dragStartX = event.x;
      dragStartY = event.y;
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    })
    .on("drag", event => {
      event.subject.fx = (event.x - viewport.x) / viewport.k;
      event.subject.fy = (event.y - viewport.y) / viewport.k;
    })
    .on("end", event => {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
      // If not moved much, open note
      const dx = event.x - dragStartX;
      const dy = event.y - dragStartY;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
        vscode.postMessage({ type: "openNote", id: event.subject.id });
      }
    }));
}

canvas.addEventListener("pointermove", (event) => {
  const x = (event.offsetX - viewport.x) / viewport.k;
  const y = (event.offsetY - viewport.y) / viewport.k;
  const node = nodes.find(n => Math.hypot(n.x - x, n.y - y) < 20);

  if (node?.id !== hoverId) {
    hoverId = node?.id;
    draw();
  }
});

document.querySelector("#chooseVault").onclick = () => vscode.postMessage({ type: "chooseVault" });
document.querySelector("#refresh").onclick = () => vscode.postMessage({ type: "refresh" });
document.querySelector("#fit").onclick = () => {
  d3.select(canvas).transition().duration(750).call(zoomHandler.transform, d3.zoomIdentity);
};
document.querySelector("#settingsButton").onclick = () => {
  const settings = document.querySelector("#settings");
  settings.hidden = !settings.hidden;
  document.querySelector("#settingsButton").setAttribute("aria-expanded", String(!settings.hidden));
};
document.querySelector("#closeSettings").onclick = () => {
  document.querySelector("#settings").hidden = true;
  document.querySelector("#settingsButton").setAttribute("aria-expanded", "false");
};

for (const control of Object.values(controls)) {
  control.addEventListener("input", () => {
    if (simulation) {
      simulation.force("link").distance(option("linkDistance"));
      simulation.force("charge").strength(-option("repelForce") * 10);
      simulation.force("center").strength(option("centerForce") / 100);
      simulation.alpha(0.3).restart();
    }
    draw();
  });
}

document.querySelector("#reset").onclick = () => {
  for (const [key, value] of Object.entries(defaults)) {
    controls[key].checked = typeof value === "boolean" ? value : (controls[key].value = value);
  }
  if (simulation) simulation.alpha(0.3).restart();
  draw();
};

addEventListener("resize", resize);
addEventListener("message", (event) => {
  if (event.data.type !== "graph") return;
  initSimulation(event.data.graph);
  document.querySelector("#emptyState").hidden = true;
  document.querySelector("#status").textContent =
    `${event.data.graph.nodes.length} notes · ${event.data.graph.edges.length} links · ${event.data.vault}`;
});

resize();
vscode.postMessage({ type: "ready" });
