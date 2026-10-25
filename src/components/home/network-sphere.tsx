"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative homepage background: a static field of faint stars, and a fixed,
 * round, loosely-wired 3D knowledge graph (hubs and spokes) at the centre of the
 * viewport, drawn with Canvas 2D and a simple perspective projection.
 * The graph is generated once from a seed (stable topology); the whole graph
 * rotates as one group, eased toward an orientation derived from the cursor.
 * It never spins on its own, ignores touch, and stays still under
 * prefers-reduced-motion. The canvas is pointer-transparent.
 */

const HUB_COUNT = 20;
const MAX_YAW = (75 * Math.PI) / 180;
const MAX_PITCH = (37 * Math.PI) / 180;
const REST_YAW = 0.35;
const REST_PITCH = -0.22;
const EASE_PER_SECOND = 4;
const STAR_DENSITY = 1 / 3800; // stars per px² of viewport
const EDGE_BUCKETS = 10;
const MAX_DPR = 2;

// Brightness by depth bucket (far → near), precomputed so frames allocate no strings.
const bucketMid = (b: number) => (b + 0.5) / EDGE_BUCKETS;
const EDGE_STYLE = Array.from({ length: EDGE_BUCKETS }, (_, b) => `rgba(255,255,255,${(0.04 + bucketMid(b) ** 2 * 0.3).toFixed(3)})`);
const NODE_STYLE = Array.from({ length: EDGE_BUCKETS }, (_, b) => {
  const d = bucketMid(b);
  const shade = Math.round(170 + d * 70);
  return `rgba(${shade},${shade},${shade},${(0.16 + d * 0.5).toFixed(3)})`;
});
const HUB_STYLE = Array.from({ length: EDGE_BUCKETS }, (_, b) => `rgba(255,255,255,${(0.35 + bucketMid(b) * 0.6).toFixed(3)})`);

interface Graph {
  /** Unit-sphere positions, xyz interleaved. */
  points: Float32Array;
  /** Node radius in px at unit depth scale. */
  sizes: Float32Array;
  hub: Uint8Array;
  /** Edge endpoints, pairs of node indices. */
  edges: Uint32Array;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A round but loosely-wired knowledge graph in 3D: hubs are scattered through
 * a ball (weighted toward its outer part, so the silhouette reads as round),
 * joined only to nearby hubs by a minimum spanning tree plus a few short
 * extra links. Each hub gets a fan of spoke nodes (kept inside the ball), a
 * few spokes sprout leaf chains, and only occasional cross-links close loops,
 * so most nodes have one or two links rather than forming a closed shell.
 */
function buildGraph(): Graph {
  const rand = mulberry32(0xa710);
  const pts: number[] = [];
  const sizes: number[] = [];
  const hubFlags: number[] = [];
  const edgeList: number[] = [];
  const randomDir = () => {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return [r * Math.cos(t), u, r * Math.sin(t)];
  };
  const addNode = (x: number, y: number, z: number, isHub: boolean) => {
    // Keep everything inside the unit ball so the outline stays round.
    const len = Math.hypot(x, y, z);
    if (len > 1) {
      const k = (0.94 + rand() * 0.06) / len;
      x *= k;
      y *= k;
      z *= k;
    }
    pts.push(x, y, z);
    hubFlags.push(isHub ? 1 : 0);
    sizes.push(isHub ? 4.2 + rand() * 1.8 : 2 + rand() * 0.9);
    return hubFlags.length - 1;
  };
  const pos = (i: number) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
  const dist = (a: number, b: number) => {
    const [ax, ay, az] = pos(a);
    const [bx, by, bz] = pos(b);
    return Math.hypot(ax - bx, ay - by, az - bz);
  };
  const link = (a: number, b: number) => edgeList.push(a, b);

  // Hubs scattered through the ball, kept apart from each other.
  const hubs: number[] = [];
  for (let tries = 0; hubs.length < HUB_COUNT && tries < 5000; tries++) {
    const [dx, dy, dz] = randomDir();
    const r = 0.3 + Math.sqrt(rand()) * 0.62; // more hubs toward the outside
    const candidate = [dx * r, dy * r, dz * r];
    const minGap = tries < 3000 ? 0.42 : 0.3;
    if (hubs.some((h) => Math.hypot(pos(h)[0] - candidate[0], pos(h)[1] - candidate[1], pos(h)[2] - candidate[2]) < minGap)) continue;
    hubs.push(addNode(candidate[0], candidate[1], candidate[2], true));
  }
  // Connect hubs with a minimum spanning tree (Prim): only short, local links.
  const inTree = new Set([hubs[0]]);
  while (inTree.size < hubs.length) {
    let best: [number, number, number] = [-1, -1, Infinity];
    for (const a of inTree) for (const b of hubs) if (!inTree.has(b) && dist(a, b) < best[2]) best = [a, b, dist(a, b)];
    link(best[0], best[1]);
    inTree.add(best[1]);
  }
  // A few extra short hub-hub links.
  for (let tries = 0, added = 0; tries < 80 && added < 4; tries++) {
    const a = hubs[Math.floor(rand() * hubs.length)];
    const b = hubs[Math.floor(rand() * hubs.length)];
    if (a !== b && dist(a, b) < 0.6) {
      link(a, b);
      added++;
    }
  }

  // Spokes around each hub, occasional leaf chains.
  const spokes: number[] = [];
  for (const hub of hubs) {
    const [hx, hy, hz] = pos(hub);
    const count = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < count; k++) {
      const [dx, dy, dz] = randomDir();
      const d = 0.12 + rand() * 0.22;
      const node = addNode(hx + dx * d, hy + dy * d, hz + dz * d, false);
      link(hub, node);
      spokes.push(node);
      if (rand() < 0.22) {
        const [nx, ny, nz] = pos(node);
        const [ex, ey, ez] = randomDir();
        const e = 0.08 + rand() * 0.1;
        link(node, addNode(nx + ex * e, ny + ey * e, nz + ez * e, false));
      }
    }
  }

  // Sparse extra structure: a few spoke-to-spoke links and spoke-to-other-hub bridges.
  for (const node of spokes) {
    const roll = rand();
    if (roll < 0.12) {
      let best = -1;
      for (const other of spokes) if (other !== node && (best < 0 || dist(node, other) < dist(node, best))) best = other;
      if (best >= 0 && dist(node, best) < 0.22) link(node, best);
    } else if (roll < 0.2) {
      let best = -1;
      for (const hub of hubs) if (dist(node, hub) > 0.05 && (best < 0 || dist(node, hub) < dist(node, best))) best = hub;
      if (best >= 0 && dist(node, best) < 0.45) link(node, best);
    }
  }

  // Centre on the centroid and scale so the outermost node sits at radius 1.
  const n = hubFlags.length;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pts[i * 3];
    cy += pts[i * 3 + 1];
    cz += pts[i * 3 + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const radii: number[] = [];
  for (let i = 0; i < n; i++) radii.push(Math.hypot(pts[i * 3] - cx, pts[i * 3 + 1] - cy, pts[i * 3 + 2] - cz));
  const maxR = Math.max(...radii);
  const points = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    points[i * 3] = (pts[i * 3] - cx) / maxR;
    points[i * 3 + 1] = (pts[i * 3 + 1] - cy) / maxR;
    points[i * 3 + 2] = (pts[i * 3 + 2] - cz) / maxR;
  }

  // Drop duplicate edges (a bridge can repeat an existing link).
  const seen = new Set<number>();
  const edges: number[] = [];
  for (let k = 0; k < edgeList.length; k += 2) {
    const a = Math.min(edgeList[k], edgeList[k + 1]);
    const b = Math.max(edgeList[k], edgeList[k + 1]);
    if (a === b || seen.has(a * n + b)) continue;
    seen.add(a * n + b);
    edges.push(a, b);
  }
  return { points, sizes: Float32Array.from(sizes), hub: Uint8Array.from(hubFlags), edges: Uint32Array.from(edges) };
}

let cachedGraph: Graph | null = null;

interface Stars {
  /** Normalised 0..1 viewport positions, xy interleaved (stable across resizes). */
  pos: Float32Array;
  size: Float32Array;
  style: string[];
}

/** A fixed, seeded starfield: mostly tiny dim points, a few slightly brighter ones. */
function buildStars(count: number): Stars {
  const rand = mulberry32(0x57a2);
  const pos = new Float32Array(count * 2);
  const size = new Float32Array(count);
  const style: string[] = [];
  for (let i = 0; i < count; i++) {
    pos[i * 2] = rand();
    pos[i * 2 + 1] = rand();
    const bright = rand() < 0.06;
    size[i] = bright ? 0.9 + rand() * 0.5 : 0.35 + rand() * 0.5;
    const alpha = bright ? 0.4 + rand() * 0.2 : 0.1 + rand() * 0.25;
    const shade = Math.round(200 + rand() * 55);
    style.push(`rgba(${shade},${shade},${shade},${alpha.toFixed(3)})`);
  }
  return { pos, size, style };
}

let cachedStars: Stars | null = null;

export function NetworkSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // static fallback: the plain dark background

    const graph = (cachedGraph ??= buildGraph());
    const n = graph.hub.length;
    // Per-frame scratch buffers, allocated once.
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    const depth = new Float32Array(n); // 0 (far) … 1 (near)
    const scale = new Float32Array(n);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let yaw = REST_YAW;
    let pitch = REST_PITCH;
    let targetYaw = REST_YAW;
    let targetPitch = REST_PITCH;
    let cx = 0;
    let cy = 0;
    let starCount = 0;
    let raf = 0;
    let last = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // The sphere sits at the centre of the screen, independent of the page layout.
      cx = width / 2;
      cy = height / 2;
      starCount = Math.round(width * height * STAR_DENSITY);
      if (!cachedStars || cachedStars.size.length < starCount) cachedStars = buildStars(Math.max(starCount, 600));
    };

    const draw = () => {
      // A large round cluster around the folder, with dark space left around the heading.
      const radius = Math.min(Math.max(Math.min(width, height) * 0.46, 180), 470);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const camera = 3.2; // distance in sphere radii: gentle perspective
      const p = graph.points;
      for (let i = 0; i < n; i++) {
        const x0 = p[i * 3];
        const y0 = p[i * 3 + 1];
        const z0 = p[i * 3 + 2];
        // yaw around Y, then pitch around X
        const x1 = x0 * cosY + z0 * sinY;
        const z1 = -x0 * sinY + z0 * cosY;
        const y2 = y0 * cosP - z1 * sinP;
        const z2 = y0 * sinP + z1 * cosP;
        const s = camera / (camera - z2);
        sx[i] = cx + x1 * radius * s;
        sy[i] = cy + y2 * radius * s;
        depth[i] = (z2 + 1) / 2;
        scale[i] = s;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Stars: static, behind the graph, never rotated.
      const stars = cachedStars!;
      for (let i = 0; i < starCount; i++) {
        ctx.fillStyle = stars.style[i];
        ctx.beginPath();
        ctx.arc(stars.pos[i * 2] * width, stars.pos[i * 2 + 1] * height, stars.size[i], 0, Math.PI * 2);
        ctx.fill();
      }

      // Edges, batched into a few brightness buckets by average depth.
      ctx.lineWidth = 0.9;
      const e = graph.edges;
      for (let b = 0; b < EDGE_BUCKETS; b++) {
        const lo = b / EDGE_BUCKETS;
        const hi = (b + 1) / EDGE_BUCKETS;
        ctx.beginPath();
        for (let k = 0; k < e.length; k += 2) {
          const d = (depth[e[k]] + depth[e[k + 1]]) / 2;
          if (d < lo || d >= hi) continue;
          ctx.moveTo(sx[e[k]], sy[e[k]]);
          ctx.lineTo(sx[e[k + 1]], sy[e[k + 1]]);
        }
        ctx.strokeStyle = EDGE_STYLE[b];
        ctx.stroke();
      }

      // Nodes, far to near by bucket so near nodes paint over far edges.
      for (let b = 0; b < EDGE_BUCKETS; b++) {
        const lo = b / EDGE_BUCKETS;
        const hi = (b + 1) / EDGE_BUCKETS;
        for (let i = 0; i < n; i++) {
          const d = depth[i];
          if (d < lo || d >= hi) continue;
          ctx.fillStyle = graph.hub[i] ? HUB_STYLE[b] : NODE_STYLE[b];
          ctx.beginPath();
          ctx.arc(sx[i], sy[i], graph.sizes[i] * scale[i] * (0.7 + d * 0.45), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const step = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      const k = 1 - Math.exp(-EASE_PER_SECOND * dt);
      yaw += (targetYaw - yaw) * k;
      pitch += (targetPitch - pitch) * k;
      draw();
      const settled = Math.abs(targetYaw - yaw) < 5e-4 && Math.abs(targetPitch - pitch) < 5e-4;
      // Stop the loop once everything has settled: no idle animation.
      raf = settled ? 0 : requestAnimationFrame(step);
      if (settled) last = 0;
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const nx = (e.clientX / width) * 2 - 1;
      const ny = (e.clientY / height) * 2 - 1;
      targetYaw = REST_YAW + nx * MAX_YAW;
      targetPitch = REST_PITCH - ny * MAX_PITCH;
      kick();
    };

    resize();
    draw();

    const onResize = () => {
      resize();
      draw();
    };
    window.addEventListener("resize", onResize);
    if (!reduceMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-20" />;
}
