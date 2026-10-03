import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import streamZip from 'node-stream-zip';
import sax from 'sax';
import XLSX from 'xlsx';
import { db, initDatabase, isRemote, writeBatch } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploads are scratch space: every workbook is parsed once, in the request
// that received it, and then discarded. Nothing reads these files again, which
// is what lets the app run on a host with no persistent disk.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

// Express 4 does not catch rejected promises from async handlers, so every
// route that touches the database is wrapped in this and routed to the error
// handler instead of hanging.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function discardUpload(req) {
  if (req.file && req.file.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
}

function colRefToNum(ref) {
  let num = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) num = num * 26 + (c - 64);
    else if (c >= 97 && c <= 122) num = num * 26 + (c - 96);
  }
  return num - 1;
}

// The user picks columns in the upload dialog, so their choice always
// wins over the built-in name matching. A mapped column is resolved
// against the header row case- and punctuation-insensitively.
function parseSenatorMapData(filePath, mapping) {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!jsonData || jsonData.length < 2) {
        resolve({ data: [], stats: { total: 0, byStatus: {}, byBranch: {} } });
        return;
      }

      const headers = jsonData[0];
      const headerMap = {};
      headers.forEach((h, i) => {
        // Normalise away punctuation and spacing so "Nama Lokasi (Google Maps)",
        // "nama_lokasi" and "Kode Cabang" all collapse to comparable keys.
        const normalized = String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalized && headerMap[normalized] === undefined) headerMap[normalized] = i;
      });

      // Match on the full normalised name first, then fall back to a prefix so a
      // decorated header such as "nama lokasi google maps" still resolves.
      const getCol = (names) => {
        for (const name of names) {
          const needle = name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (headerMap[needle] !== undefined) return headerMap[needle];
        }
        for (const name of names) {
          const needle = name.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const key of Object.keys(headerMap)) {
            if (key.startsWith(needle) || needle.startsWith(key)) return headerMap[key];
          }
        }
        return -1;
      };

      // Resolve a user-chosen column name to its index. Falls back to a
      // contains-match so "Latitude (decimal)" still finds "latitude".
      const resolveMapped = (chosen) => {
        if (chosen === undefined || chosen === null || chosen === '') return -1;
        const needle = String(chosen).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (headerMap[needle] !== undefined) return headerMap[needle];
        for (const key of Object.keys(headerMap)) {
          if (key.includes(needle) || needle.includes(key)) return headerMap[key];
        }
        return -1;
      };

      const pick = (chosen, defaults) => {
        const idx = resolveMapped(chosen);
        return idx >= 0 ? idx : getCol(defaults);
      };

      // Indonesian decimal/comma formatting, stray whitespace and thousands
      // separators all appear in hand-maintained branch spreadsheets.
      const parseCoord = (value) => {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        let text = String(value).trim().replace(/\s/g, '');
        if (!text) return null;
        // "1.234,56" (Indonesian) vs "1,234.56" (English)
        if (/,\d{1,2}$/.test(text) && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
        else text = text.replace(/,/g, '');
        const num = Number(text);
        return Number.isFinite(num) ? num : null;
      };

      const colBranchCode = pick(mapping?.branchCode, ['kode cabang', 'kode_cabang', 'branchcode', 'branch_code']);
      const colBranchName = pick(mapping?.branchName, ['cabang', 'branchname', 'branch_name', 'nama cabang']);
      const colName = pick(mapping?.name, ['nama lokasi', 'nama_lokasi', 'nearby_name', 'name', 'place name']);
      const colAddress = pick(mapping?.address, ['alamat', 'address']);
      const colLat = pick(mapping?.lat, ['nearby_lat', 'lat', 'latitude']);
      const colLng = pick(mapping?.lng, ['nearby_lng', 'lng', 'longitude', 'long']);
      const colStatus = pick(mapping?.status, ['ket', 'status', 'ket status']);
      const colMidNmid = pick(mapping?.midNmid, ['mid/nmid', 'mid_nmid', 'midnmid']);
      const colPlaceId = pick(mapping?.placeId, ['nearby_place_id', 'placeid', 'place_id']);

      const data = [];
      const byStatus = {};
      const byBranch = {};
      let missingCoords = 0;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const branchCode = colBranchCode >= 0 ? String(row[colBranchCode] || '').trim() : '';
        const branchName = colBranchName >= 0 ? String(row[colBranchName] || '').trim() : '';
        const name = colName >= 0 ? String(row[colName] || '').trim() : '';
        const address = colAddress >= 0 ? String(row[colAddress] || '').trim() : '';
        // Missing coordinates stay null. Emitting 0 here pins the marker to the
        // Gulf of Guinea, which is indistinguishable from a real 0,0 record.
        const lat = colLat >= 0 ? parseCoord(row[colLat]) : null;
        const lng = colLng >= 0 ? parseCoord(row[colLng]) : null;
        const status = colStatus >= 0 ? String(row[colStatus] || '').trim() : 'Belum FU';
        const midNmid = colMidNmid >= 0 ? row[colMidNmid] : '';

        if (!name && !branchName && !branchCode) continue;

        const hasCoords = lat !== null && lng !== null;
        if (!hasCoords) missingCoords++;

        const location = {
          id: i,
          placeId: (colPlaceId >= 0 && row[colPlaceId] !== undefined && row[colPlaceId] !== null && row[colPlaceId] !== '')
            ? String(row[colPlaceId])
            : `place_${i}`,
          branchCode,
          branchName,
          address,
          lat: hasCoords ? lat : null,
          lng: hasCoords ? lng : null,
          hasCoords,
          name: name || branchName || `Location ${i}`,
          status: status || 'Belum FU',
          srcLat: hasCoords ? lat : null,
          srcLng: hasCoords ? lng : null,
          midNmid: midNmid || '',
          sorotLink: ''
        };

        data.push(location);

        byStatus[location.status] = (byStatus[location.status] || 0) + 1;
        byBranch[location.branchName] = (byBranch[location.branchName] || 0) + 1;
      }

      const stats = {
        total: data.length,
        withCoords: data.length - missingCoords,
        missingCoords,
        byStatus,
        byBranch
      };

      // The REKAM MEDIS cabang workbooks carry no header row the senator
      // column names match — their first rows are area and section labels,
      // and branch rows simply start with a 5-digit code and a name. When
      // nothing matched above, scan for those rows so the same workbook
      // still plots instead of coming back empty. Skipped when the user
      // mapped columns explicitly: their choice is the intent, so an empty
      // result means the mapping genuinely did not fit this file.
      const hasUserMapping = mapping && Object.values(mapping).some((v) => v);
      if (data.length === 0 && !hasUserMapping) {
        const seen = new Set();
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;
          const code = String(row[0] || '').trim();
          const name = String(row[1] || '').trim();
          if (!/^\d{5}$/.test(code) || !name) continue;
          if (seen.has(code)) continue;
          seen.add(code);

          const coords = BRANCH_COORDS[code] || null;
          const lat = coords ? coords[0] : null;
          const lng = coords ? coords[1] : null;
          const hasCoords = lat !== null && lng !== null;

          const location = {
            id: i,
            placeId: `place_${i}`,
            branchCode: code,
            branchName: name,
            address: '',
            lat,
            lng,
            hasCoords,
            name,
            status: 'Belum FU',
            srcLat: lat,
            srcLng: lng,
            midNmid: '',
            sorotLink: ''
          };

          data.push(location);
          byStatus[location.status] = (byStatus[location.status] || 0) + 1;
          byBranch[name] = (byBranch[name] || 0) + 1;
          if (!hasCoords) missingCoords++;
        }

        stats.total = data.length;
        stats.withCoords = data.length - missingCoords;
        stats.missingCoords = missingCoords;
        stats.byStatus = byStatus;
        stats.byBranch = byBranch;
      }

      // Rows that parsed without coordinates can still be positioned when
      // their branch code is one of the 41 known branches.
      for (const location of data) {
        if (location.hasCoords) continue;
        const coords = location.branchCode ? BRANCH_COORDS[location.branchCode] : null;
        if (!coords) continue;
        location.lat = coords[0];
        location.lng = coords[1];
        location.srcLat = coords[0];
        location.srcLng = coords[1];
        location.hasCoords = true;
        missingCoords--;
      }
      if (missingCoords < 0) {
        stats.withCoords = data.length;
        stats.missingCoords = 0;
      }

      resolve({ data, stats });
    } catch (e) {
      reject(e);
    }
  });
}

function parseEchoWorkbook(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.readFile(filePath);
      const businessSheetName = workbook.SheetNames.find(name => /business|ecosystem|merchant|outlet|supplier|buyer/i.test(name)) || workbook.SheetNames[0];
      const relationshipSheetName = workbook.SheetNames.find(name => /relationship|relation|transaction|link|edge/i.test(name));
      const businessSheet = workbook.Sheets[businessSheetName];
      const relationshipSheet = relationshipSheetName ? workbook.Sheets[relationshipSheetName] : null;
      const businessRows = XLSX.utils.sheet_to_json(businessSheet, { header: 1 });
      const relationshipRows = relationshipSheet ? XLSX.utils.sheet_to_json(relationshipSheet, { header: 1 }) : [];

      if (!businessRows || businessRows.length < 2) {
        resolve({ ecosystems: [], stats: { businesses: 0, relationships: 0 } });
        return;
      }

      const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
      const headerMap = (headers) => {
        const map = {};
        headers.forEach((h, i) => { map[normalize(h)] = i; });
        return map;
      };
      const getCol = (map, names) => {
        for (const name of names) {
          const idx = map[normalize(name)];
          if (idx !== undefined) return idx;
        }
        return -1;
      };
      const num = value => {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const bool = value => {
        const normalized = normalize(value);
        return ['1', 'true', 'yes', 'ya', 'y', 'benar', 'sudah', 'closed', 'closedloop', 'loop'].includes(normalized);
      };

      const businessHeaders = businessRows[0] || [];
      const businessMap = headerMap(businessHeaders);
      const colName = getCol(businessMap, ['name', 'businessname', 'business', 'merchantname', 'merchant', 'outletname', 'outlet', 'suppliername', 'buyername']);
      const colType = getCol(businessMap, ['businesstype', 'type', 'jenis', 'tipe', 'role']);
      const colSegment = getCol(businessMap, ['segment', 'segmen', 'segmentation']);
      const colLat = getCol(businessMap, ['lat', 'latitude', 'latitudekoordinat']);
      const colLng = getCol(businessMap, ['lng', 'longitude', 'long']);
      const colBranch = getCol(businessMap, ['branchcode', 'kodecabang', 'cabang']);
      const colProducts = getCol(businessMap, ['productsheld', 'products', 'produk', 'product']);
      const colEcommerce = getCol(businessMap, ['ecommercepotential', 'ecommerce', 'potensiecommerce', 'digitalpotential']);
      const colSocial = getCol(businessMap, ['socialnetworkstrength', 'socialnetwork', 'social', 'jejaringsosial']);
      const colPriority = getCol(businessMap, ['priorityscore', 'priority', 'score', 'skorprioritas']);
      const colMandiri = getCol(businessMap, ['mandiricustomer', 'mandiri', 'nasabahmandiri', 'customermandiri']);

      const businesses = [];
      for (let i = 1; i < businessRows.length; i++) {
        const row = businessRows[i];
        if (!row || row.length === 0) continue;
        const name = colName >= 0 ? String(row[colName] || '').trim() : '';
        const lat = colLat >= 0 ? num(row[colLat]) : 0;
        const lng = colLng >= 0 ? num(row[colLng]) : 0;
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

        const ecommercePotential = colEcommerce >= 0 ? num(row[colEcommerce]) : 0;
        const socialNetworkStrength = colSocial >= 0 ? num(row[colSocial]) : 0;
        const priorityScore = colPriority >= 0 ? num(row[colPriority]) : 0;
        const mandiriCustomer = colMandiri >= 0 ? (bool(row[colMandiri]) ? 1 : 0) : 0;
        const products = colProducts >= 0 ? String(row[colProducts] || '').split(/[;,]/).map(p => p.trim()).filter(Boolean) : [];
        const businessType = colType >= 0 ? String(row[colType] || '').trim() : 'related';
        const segment = colSegment >= 0 ? String(row[colSegment] || '').trim() : 'Pebisnis';

        businesses.push({
          id: `b_${i}`,
          name,
          segment,
          businessType,
          lat,
          lng,
          branchCode: colBranch >= 0 ? String(row[colBranch] || '').trim() : '',
          productsHeld: products,
          ecommercePotential,
          socialNetworkStrength,
          priorityScore,
          priorityTier: priorityScore >= 80 ? 'High' : priorityScore >= 50 ? 'Medium' : 'Low',
          mandiriCustomer,
        });
      }

      const businessByName = new Map(businesses.map(b => [normalize(b.name), b]));
      const relationships = [];
      if (relationshipRows.length > 1) {
        const relationshipHeaders = relationshipRows[0] || [];
        const relationshipMap = headerMap(relationshipHeaders);
        const colFrom = getCol(relationshipMap, ['frombusiness', 'from', 'source', 'sourcebusiness', 'businessfrom']);
        const colTo = getCol(relationshipMap, ['tobusiness', 'to', 'target', 'targetbusiness', 'businessto']);
        const colRelType = getCol(relationshipMap, ['relationshiptype', 'type', 'relationship', 'relation', 'linktype']);
        const colCategory = getCol(relationshipMap, ['category', 'kategori', 'product', 'produk']);
        const colTxValue = getCol(relationshipMap, ['transactionvalue', 'transaction', 'value', 'nilaitransaksi', 'amount']);
        const colTxVolume = getCol(relationshipMap, ['transactionvolume', 'volume', 'jumlahtransaksi', 'count']);
        const colClosed = getCol(relationshipMap, ['closedloop', 'closed', 'loop', 'loopmandiri', 'mandiriloop']);

        for (let i = 1; i < relationshipRows.length; i++) {
          const row = relationshipRows[i];
          if (!row || row.length === 0) continue;
          const fromName = colFrom >= 0 ? String(row[colFrom] || '').trim() : '';
          const toName = colTo >= 0 ? String(row[colTo] || '').trim() : '';
          const from = businessByName.get(normalize(fromName));
          const to = businessByName.get(normalize(toName));
          if (!from || !to) continue;

          const explicitClosed = colClosed >= 0 ? bool(row[colClosed]) : false;
          relationships.push({
            id: `r_${i}`,
            fromBusinessId: from.id,
            toBusinessId: to.id,
            relationshipType: colRelType >= 0 ? String(row[colRelType] || '').trim().toLowerCase() : 'partner',
            category: colCategory >= 0 ? String(row[colCategory] || '').trim() : '',
            transactionValue: colTxValue >= 0 ? num(row[colTxValue]) : 0,
            transactionVolume: colTxVolume >= 0 ? Math.round(num(row[colTxVolume])) : 0,
            closedLoop: explicitClosed || (from.mandiriCustomer && to.mandiriCustomer) ? 1 : 0,
          });
        }
      }

      const ecosystem = {
        id: `echo_${Date.now()}`,
        anchorName: businesses[0]?.name || 'ECHO Ecosystem',
        anchorSegment: businesses[0]?.segment || 'Pebisnis',
        businesses,
        relationships,
      };

      resolve({ ecosystems: [ecosystem], stats: { businesses: businesses.length, relationships: relationships.length } });
    } catch (e) {
      reject(e);
    }
  });
}

function findSimpleCycles(adj) {
  const nodes = [...adj.keys()];
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]));
  const cycles = [];
  const seenKeys = new Set();

  const canonical = (path) => {
    let minIdx = 0;
    let minVal = nodeIndex.get(path[0]) || 0;
    for (let i = 1; i < path.length; i++) {
      const v = nodeIndex.get(path[i]) || 0;
      if (v < minVal) { minVal = v; minIdx = i; }
    }
    const rotated = [...path.slice(minIdx), ...path.slice(0, minIdx)];
    return rotated.join('->');
  };

  const visit = (start, current, path, onPath) => {
    const neighbors = adj.get(current) || [];
    const startIdx = nodeIndex.get(start) || 0;
    for (const nb of neighbors) {
      const nbIdx = nodeIndex.get(nb);
      if (nbIdx === undefined || nbIdx < startIdx) continue;
      if (nb === start) {
        const key = canonical(path);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          cycles.push([...path]);
        }
      } else if (!onPath.has(nb)) {
        onPath.add(nb);
        path.push(nb);
        visit(start, nb, path, onPath);
        path.pop();
        onPath.delete(nb);
      }
    }
  };

  for (const start of nodes) {
    visit(start, start, [start], new Set([start]));
  }
  return cycles;
}

function calculateEchoMetrics(ecosystem) {
  const businesses = ecosystem.businesses || [];
  const relationships = ecosystem.relationships || [];
  const byId = new Map(businesses.map(b => [b.id, b]));

  const totalTransactionValue = relationships.reduce((sum, r) => sum + (r.transactionValue || 0), 0);
  const closedLoopValue = relationships.filter(r => r.closedLoop).reduce((sum, r) => sum + (r.transactionValue || 0), 0);
  const closedLoopPercent = totalTransactionValue > 0 ? Math.round((closedLoopValue / totalTransactionValue) * 100) : 0;

  const byBusinessType = {};
  const ensureSlot = (type) => {
    if (!byBusinessType[type]) byBusinessType[type] = { count: 0, transactionInValue: 0, transactionOutValue: 0 };
  };
  for (const b of businesses) {
    ensureSlot(b.businessType);
    byBusinessType[b.businessType].count += 1;
  }
  for (const r of relationships) {
    const fromB = byId.get(r.fromBusinessId);
    const toB = byId.get(r.toBusinessId);
    if (fromB) { ensureSlot(fromB.businessType); byBusinessType[fromB.businessType].transactionOutValue += r.transactionValue || 0; }
    if (toB) { ensureSlot(toB.businessType); byBusinessType[toB.businessType].transactionInValue += r.transactionValue || 0; }
  }

  const ecommercePotentialTotal = businesses.reduce((s, b) => s + (b.ecommercePotential || 0), 0);
  const socialNetworkTotal = businesses.reduce((s, b) => s + (b.socialNetworkStrength || 0), 0);
  const avgSocialNetworkStrength = businesses.length > 0 ? Math.round((socialNetworkTotal / businesses.length) * 100) / 100 : 0;
  const mandiriCustomerCount = businesses.filter(b => b.mandiriCustomer).length;

  const mandiriAdj = new Map();
  for (const b of businesses) {
    if (b.mandiriCustomer) mandiriAdj.set(b.id, []);
  }
  const cycleEdgeValues = new Map();
  const edgeKey = (from, to) => `${from}->${to}`;
  for (const r of relationships) {
    const fromB = byId.get(r.fromBusinessId);
    const toB = byId.get(r.toBusinessId);
    if (fromB && toB && fromB.mandiriCustomer && toB.mandiriCustomer) {
      mandiriAdj.get(r.fromBusinessId).push(r.toBusinessId);
      cycleEdgeValues.set(edgeKey(r.fromBusinessId, r.toBusinessId), (cycleEdgeValues.get(edgeKey(r.fromBusinessId, r.toBusinessId)) || 0) + (r.transactionValue || 0));
    }
  }
  const cycles = findSimpleCycles(mandiriAdj);
  const edgesInCycle = new Set();
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i++) {
      edgesInCycle.add(edgeKey(cycle[i], cycle[(i + 1) % cycle.length]));
    }
  }
  const closedLoopCycleValue = [...edgesInCycle].reduce((sum, e) => sum + (cycleEdgeValues.get(e) || 0), 0);
  const closedLoopCycleCount = cycles.length;

  const topPotential = [...businesses]
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 5)
    .map(b => ({ id: b.id, name: b.name, segment: b.segment, businessType: b.businessType, priorityScore: b.priorityScore || 0, priorityTier: b.priorityTier || 'Low' }));

  return {
    totalTransactionValue,
    closedLoopValue,
    closedLoopPercent,
    leakagePercent: totalTransactionValue > 0 ? 100 - closedLoopPercent : 0,
    closedLoopCycleCount,
    closedLoopCycleValue,
    ecommercePotentialTotal,
    socialNetworkTotal,
    avgSocialNetworkStrength,
    mandiriCustomerCount,
    byBusinessType,
    businessCount: businesses.length,
    relationshipCount: relationships.length,
    topPotential,
  };
}

function serializeEcosystem(ecosystem) {
  const businesses = (ecosystem.businesses || []).map(b => ({
    id: b.id,
    name: b.name,
    segment: b.segment,
    businessType: b.business_type || b.businessType || 'related',
    lat: b.lat,
    lng: b.lng,
    branchCode: b.branch_code || b.branchCode || '',
    productsHeld: Array.isArray(b.products_held) ? b.products_held : (b.productsHeld || []),
    ecommercePotential: b.ecommerce_potential ?? b.ecommercePotential ?? 0,
    socialNetworkStrength: b.social_network_strength ?? b.socialNetworkStrength ?? 0,
    priorityScore: b.priority_score ?? b.priorityScore ?? 0,
    priorityTier: b.priority_tier || b.priorityTier || 'Low',
    mandiriCustomer: Boolean(b.mandiri_customer ?? b.mandiriCustomer),
    transactionInValue: 0,
    transactionOutValue: 0,
  }));
  const index = new Map(businesses.map(b => [b.id, b]));
  const relationships = (ecosystem.relationships || []).map(r => {
    const fromB = index.get(r.from_business_id || r.fromBusinessId);
    const toB = index.get(r.to_business_id || r.toBusinessId);
    const explicitClosed = Boolean(r.closed_loop ?? r.closedLoop);
    const reactiveClosed = Boolean(fromB && fromB.mandiriCustomer && toB && toB.mandiriCustomer);
    return {
      id: r.id,
      fromBusinessId: r.from_business_id || r.fromBusinessId,
      toBusinessId: r.to_business_id || r.toBusinessId,
      type: r.relationship_type || r.relationshipType || 'partner',
      category: r.category || '',
      transactionValue: r.transaction_value ?? r.transactionValue ?? 0,
      transactionVolume: r.transaction_volume ?? r.transactionVolume ?? 0,
      closedLoop: explicitClosed || reactiveClosed,
    };
  });
  for (const r of relationships) {
    const v = r.transactionValue || 0;
    const from = index.get(r.fromBusinessId);
    const to = index.get(r.toBusinessId);
    if (from) from.transactionOutValue += v;
    if (to) to.transactionInValue += v;
  }

  return {
    id: ecosystem.id,
    anchorName: ecosystem.anchor_name || ecosystem.anchorName,
    anchorSegment: ecosystem.anchor_segment || ecosystem.anchorSegment,
    branchCode: ecosystem.branch_code || ecosystem.branchCode || '',
    businesses,
    relationships,
  };
}

function streamParseTemplate(filePath, period) {
  const INSERT_CUSTOMER = `
    INSERT OR REPLACE INTO customers (cifno, name, segment, branch_code, branch_name, hub_id, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const INSERT_ACCOUNT = `
    INSERT INTO accounts (cifno, acctno, actype, template_period, cbalrp, avgbalrp, rate, ddctyp, datop6, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const batchCustomer = [];
  const batchAccount = [];
  const BATCH_SIZE = 10000;
  let totalRows = 0;
  const sharedStrings = [];

  return new Promise((resolve, reject) => {
    const zip = new streamZip({ file: filePath, storeEntries: true });

    zip.on('error', reject);

    let pendingStreams = 0;
    let ready = false;
    let resolved = false;
    let worksheetProcessed = false;
    let worksheetRows = null;

    async function checkFinish() {
      if (ready && pendingStreams === 0 && !resolved) {
        resolved = true;
        try {
          if (worksheetRows) {
            processRows(worksheetRows, period);
            for (let j = 0; j < batchCustomer.length; j += BATCH_SIZE) {
              const chunkC = batchCustomer.splice(0, BATCH_SIZE);
              const chunkA = batchAccount.splice(0, BATCH_SIZE);
              const statements = [
                ...chunkC.map((c) => ({ sql: INSERT_CUSTOMER, args: c })),
                ...chunkA.map((a) => ({ sql: INSERT_ACCOUNT, args: a }))
              ];
              await writeBatch(statements);
            }
          }
          zip.close();
          resolve(totalRows);
        } catch (err) {
          try { zip.close(); } catch { /* already closing */ }
          reject(err);
        }
      }
    }

    zip.on('entry', (entry) => {
      const isSharedStr = entry.name === 'xl/sharedStrings.xml';
      const isWorksheet = entry.name === 'xl/worksheets/sheet2.xml' || entry.name === 'xl/worksheets/sheet1.xml';
      if (!isSharedStr && !isWorksheet) return;
      if (isWorksheet && worksheetProcessed) return;
      if (isWorksheet) worksheetProcessed = true;

      pendingStreams++;

      zip.stream(entry, (err, stream) => {
        if (err) {
          pendingStreams--;
          reject(err);
          return;
        }

        if (isSharedStr) {
          let currentSI = false;
          let currentText = '';
          const parser = sax.createStream(true, { lowercase: true });

          parser.on('opentag', (node) => {
            if (node.name === 'si') {
              currentSI = true;
              currentText = '';
            }
          });

          parser.on('text', (text) => {
            if (currentSI) {
              currentText += text;
            }
          });

          parser.on('closetag', (name) => {
            if (name === 'si') {
              sharedStrings.push(currentText);
              currentSI = false;
              currentText = '';
            }
          });

          parser.on('error', reject);

          parser.on('end', () => {
            pendingStreams--;
            checkFinish();
          });

          stream.pipe(parser);
        }

        if (isWorksheet) {
          const rowsData = [];
          let currentCell = null;
          let currentCellValue = null;
          const parser = sax.createStream(true, { lowercase: true });

          parser.on('opentag', (node) => {
            if (node.name === 'row') {
              rowsData.push([]);
            } else if (node.name === 'c') {
              const ref = node.attributes.r || '';
              const colRef = ref.replace(/\d+$/, '');
              const colNum = colRefToNum(colRef);
              currentCell = { colNum, type: node.attributes.t || '' };
              currentCellValue = null;
            }
          });

          parser.on('text', (text) => {
            if (currentCell && text) {
              currentCellValue = (currentCellValue || '') + text;
            }
          });

          parser.on('closetag', (name) => {
            if (name === 'c' && currentCell) {
              let value = currentCellValue || '';
              if (currentCell.type === 's' && sharedStrings.length > 0) {
                const idx = parseInt(value);
                value = sharedStrings[idx] || String(idx);
              }
              const lastRow = rowsData[rowsData.length - 1];
              lastRow[currentCell.colNum] = value;
              currentCell = null;
              currentCellValue = null;
            }
          });

          parser.on('error', reject);

           parser.on('end', () => {
            worksheetRows = rowsData;
            pendingStreams--;
            checkFinish();
          });

          stream.pipe(parser);
        }
      });
    });

    zip.on('ready', () => {
      ready = true;
      checkFinish();
    });
  });

  function processRows(rows, p) {
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row) || row.length < 18) continue;

      const cifno = String(row[3] || '').trim();
      if (!cifno || cifno === 'Grand Total') continue;

      const productType = String(row[17] || '').trim();

      const customerData = [
        cifno,
        String(row[6] || '').trim(),
        productType,
        String(row[0] || '').trim(),
        String(row[1] || '').trim(),
        String(row[2] || '').trim(),
        'active'
      ];

      const accountData = [
        cifno,
        String(row[4] || '').trim(),
        productType,
        p,
        parseFloat(row[5] || 0) || 0,
        parseFloat(row[6] || 0) || 0,
        parseFloat(row[11] || 0) || 0,
        String(row[14] || '').trim(),
        String(row[15] || '').trim(),
        'active'
      ];

      batchCustomer.push(customerData);
      batchAccount.push(accountData);
      totalRows++;
    }
  }
}

app.get('/api/admin/status', ah(async (req, res) => {
  // Each count is an independent round trip. Against a remote database that
  // is one network hop per statement, so they run concurrently.
  const [customers, accounts, signals] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM customers').get(),
    db.prepare('SELECT COUNT(*) as cnt FROM accounts').get(),
    db.prepare('SELECT COUNT(*) as cnt FROM denyut_signals').get()
  ]);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    data: { customers: customers.cnt, accounts: accounts.cnt, signals: signals.cnt }
  });
}));

app.post('/api/admin/upload/senator', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let mapping = null;
  if (req.body && req.body.mapping) {
    try { mapping = JSON.parse(req.body.mapping); } catch { mapping = null; }
  }
  try {
    const result = await parseSenatorMapData(req.file.path, mapping);
    await db.prepare('INSERT OR REPLACE INTO default_data (data_type, data, stats) VALUES (?, ?, ?)').run('senator', JSON.stringify(result.data), JSON.stringify(result.stats));
    res.json({ success: true, data: result.data, stats: result.stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

// Branch coordinates for the 41 branches in the radar workbook,
// keyed by 5-digit branch code. The workbook itself carries no
// location columns, so the map joins on this table.
const BRANCH_COORDS = {
  '13800': [-7.5671513, 110.8101858],
  '13801': [-7.5651108, 110.8039404],
  '13802': [-7.7129117, 110.5937162],
  '13803': [-7.5715089, 110.8276454],
  '13804': [-7.5753702, 110.8267448],
  '13805': [-7.5661550, 110.8675268],
  '13806': [-7.5382162, 110.6089110],
  '13807': [-7.5975296, 110.8147909],
  '13808': [-7.5518125, 110.7921875],
  '13809': [-7.6163430, 110.7005432],
  '13810': [-7.5945158, 110.9447847],
  '13811': [-7.4305925, 111.0065626],
  '13812': [-7.5554915, 110.7479779],
  '13813': [-7.6851194, 110.8440683],
  '13814': [-7.5637035, 110.8237826],
  '13815': [-7.5742119, 110.8208158],
  '13821': [-7.8129046, 110.9242317],
  '13822': [-7.5634595, 110.8353824],
  '13823': [-7.5502544, 110.8214161],
  '13825': [-7.3980155, 110.8265687],
  '13826': [-7.5640191, 110.8555954],
  '13827': [-7.5814986, 110.8189667],
  '13874': [-7.3658319, 110.6387696],
  '13875': [-7.6963425, 110.7008651],
  '13876': [-7.9795920, 110.9340659],
  '13877': [-7.7552848, 110.4983090],
  '13878': [-7.3846379, 110.9110453],
  '13879': [-7.6153543, 111.0789569],
  '13881': [-7.6372194, 110.6012384],
  '13884': [-7.4392189, 110.6769572],
  '13885': [-7.7598523, 110.6959797],
  '13886': [-7.8268536, 111.1262068],
  '13887': [-7.5239067, 110.9983126],
  '13888': [-7.7357027, 110.7952652],
  '13889': [-7.5822859, 110.7838014],
  '13890': [-7.4067732, 111.1098136],
  '13891': [-7.8468328, 111.2628140],
  '13893': [-8.0562438, 110.8082813],
  '13894': [-7.8146299, 110.9985829],
  '13897': [-7.4699811, 110.9309179],
  '13898': [-7.6654651, 110.7506948],
};

function parseRadarWorkbook(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.readFile(filePath);
      // Use the "Prosentase" (performance ratio) sheet — it carries the
      // lagging/leading classification data for every branch.
      const sheetName = workbook.SheetNames.find(n => /sentase/i.test(n)) || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const num = v => { const p = parseFloat(v); return Number.isFinite(p) ? p : null; };

      // The sheet has several product sections stacked vertically. Every real
      // branch row starts with a 5-digit branch code and a branch name.
      // Data layout per row (verified against REKAM MEDIS CABANG JULI 2026.xlsx):
      //   col 0 = branch code, col 1 = branch name, col 4 = product type (may be absent)
      //   cols 5..28 = 24 monthly nominal values (may be absent)
      //   cols 29..47 = per-product values (ratios for some products, nominal for others)
      //   col 102 = aggregate year (2024/2025/2026), cols 103..114 = aggregate
      //     performance ratios (12 when year is 2024/2025, 7 when year is 2026)
      // The aggregate block is only present on rows long enough (len >= 110).
      // We collect EVERY branch and use the last available aggregate ratio as the
      // branch performance, so all 41 branches show up on the radar map.

      const latestRatio = (row, start, end) => {
        for (let c = end; c >= start; c--) {
          const v = num(row[c]);
          if (v !== null) return v;
        }
        return null;
      };

      const branchMap = new Map();

      for (let i = 7; i < json.length; i++) {
        const row = json[i];
        if (!row || row.length < 2) continue;
        const code = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        // Only real branch rows: 5-digit code + a name.
        // This skips area headers (Kota Surakarta, Kab. Klaten…), the "138 Area
        // Solo" pseudo-row, section headers (LEADING, PROFITABILITAS…), and
        // "Historical Pencapaian" / date-separator label rows.
        if (!/^\d{5}$/.test(code) || !name) continue;

        // Monthly nominal total (assets under management proxy).
        let totalDpk = 0;
        for (let c = 5; c <= 28; c++) { const v = num(row[c]); if (v !== null) totalDpk += v; }

        // Growth rate from the last two monthly values, when available.
        const m24 = num(row[27]); // 2nd-to-last of the 24-month block
        const m23 = num(row[28]); // last
        let growthRate = 0;
        if (m23 !== null && m24 !== null && m24 > 0) {
          growthRate = ((m23 - m24) / m24) * 100;
        }

        // Best available aggregate performance ratio (×100 → percent).
        // Only the cols 103..114 block holds ratios; cols 29..47 hold nominal
        // values for ratio-only product rows, so they are NOT used here.
        const perfRatio = latestRatio(row, 103, 114);
        const perf = perfRatio === null ? 0 : perfRatio * 100;

        if (!branchMap.has(code)) {
          branchMap.set(code, { code, name, totalDpk: 0, growthRate, perf });
        }
        const b = branchMap.get(code);
        b.totalDpk += totalDpk;
        // Keep the best (max) performance ratio if a branch spans multiple product rows.
        if (perf > b.perf) b.perf = perf;
      }

      const classify = pct => pct >= 90 ? 'performing' : pct >= 75 ? 'partially performing' : 'non-performing';

      const branches = [];
      let idx = 0;
      for (const b of branchMap.values()) {
        const perf = b.perf;
        const laggingClass = classify(perf);
        const leadingClass = classify(perf);
        const coords = BRANCH_COORDS[b.code] || null;

        branches.push({
          id: ++idx,
          branchCode: b.code,
          branchName: b.name,
          lat: coords ? coords[0] : null,
          lng: coords ? coords[1] : null,
          performance: b.growthRate >= 0 ? 'growing' : 'stagnant',
          performanceValue: perf,
          totalDpk: b.totalDpk,
          growthRate: b.growthRate,
          laggingScore: perf,
          laggingClass,
          leadingScore: perf,
          leadingClass,
          leadingGreen: 0,
          leadingTotal: 0,
          products: [],
          dpkProducts: [],
          kreditProducts: [],
          leadingProducts: [],
        });
      }

      resolve(branches);
    } catch (e) {
      reject(e);
    }
  });
}

app.post('/api/admin/upload/radar', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const branches = await parseRadarWorkbook(req.file.path);
    await db.prepare('INSERT OR REPLACE INTO default_data (data_type, data, stats) VALUES (?, ?, ?)').run('radar', JSON.stringify(branches), JSON.stringify({ processed: branches.length }));
    res.json({ success: true, data: branches, stats: { processed: branches.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

app.post('/api/upload/radar', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const branches = await parseRadarWorkbook(req.file.path);
    await db.prepare('INSERT OR REPLACE INTO default_data (data_type, data, stats) VALUES (?, ?, ?)').run('radar', JSON.stringify(branches), JSON.stringify({ processed: branches.length }));
    res.json({ success: true, data: branches, stats: { processed: branches.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

app.post('/api/admin/upload/denyut', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const clear = req.query.clear === 'true';
  try {
    if (clear) {
      await db.exec('DELETE FROM denyut_signals');
    }
    const stats = await streamParseTemplate(req.file.path, 'denyut');
    res.json({ success: true, data: [], stats: { processed: stats }, rowsProcessed: stats, periods: ['denyut'], cleared: clear });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

app.get('/api/default/senator', ah(async (req, res) => {
  const row = await db.prepare('SELECT data FROM default_data WHERE data_type = ?').get(['senator']);
  if (!row) return res.json({ data: null });
  try { res.json(JSON.parse(row.data)); } catch { res.status(500).json({ error: 'Invalid JSON' }); }
}));

app.get('/api/default/radar', ah(async (req, res) => {
  const row = await db.prepare('SELECT data FROM default_data WHERE data_type = ?').get(['radar']);
  if (!row) return res.json({ data: null });
  try { res.json(JSON.parse(row.data)); } catch { res.status(500).json({ error: 'Invalid JSON' }); }
}));

app.get('/api/echo/ecosystems', ah(async (req, res) => {
  const ecosystems = await db.prepare('SELECT * FROM echo_ecosystems ORDER BY created_at DESC').all();
  const result = [];
  for (const eco of ecosystems) {
    const businesses = await db.prepare('SELECT * FROM echo_businesses WHERE ecosystem_id = ? ORDER BY name').all(eco.id);
    const relationships = await db.prepare('SELECT * FROM echo_relationships WHERE ecosystem_id = ? ORDER BY id').all(eco.id);
    const serialized = serializeEcosystem({ ...eco, businesses, relationships });
    result.push({ ...serialized, metrics: calculateEchoMetrics(serialized) });
  }
  res.json({ ecosystems: result });
}));

app.get('/api/echo/ecosystems/:id', ah(async (req, res) => {
  const eco = await db.prepare('SELECT * FROM echo_ecosystems WHERE id = ?').get(req.params.id);
  if (!eco) return res.status(404).json({ error: 'Ecosystem not found' });
  const businesses = await db.prepare('SELECT * FROM echo_businesses WHERE ecosystem_id = ? ORDER BY name').all(eco.id);
  const relationships = await db.prepare('SELECT * FROM echo_relationships WHERE ecosystem_id = ? ORDER BY id').all(eco.id);
  const serialized = serializeEcosystem({ ...eco, businesses, relationships });
  res.json({ ecosystem: serialized, metrics: calculateEchoMetrics(serialized) });
}));

app.post('/api/echo/upload', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const clear = req.query.clear === 'true';
  try {
    const parsed = await parseEchoWorkbook(req.file.path);
    if (clear) {
      await db.exec('DELETE FROM echo_relationships; DELETE FROM echo_businesses; DELETE FROM echo_ecosystems;');
    }

    const INSERT_ECOSYSTEM = 'INSERT INTO echo_ecosystems (id, anchor_name, anchor_segment, branch_code) VALUES (?, ?, ?, ?)';
    const INSERT_BUSINESS = `
      INSERT INTO echo_businesses (
        id, ecosystem_id, name, segment, business_type, lat, lng, branch_code, products_held,
        ecommerce_potential, social_network_strength, priority_score, priority_tier, mandiri_customer
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const INSERT_RELATIONSHIP = `
      INSERT INTO echo_relationships (
        ecosystem_id, from_business_id, to_business_id, relationship_type, category,
        transaction_value, transaction_volume, closed_loop
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const statements = [];
    for (const eco of parsed.ecosystems) {
      statements.push({
        sql: INSERT_ECOSYSTEM,
        args: [eco.id, eco.anchorName, eco.anchorSegment, eco.branchCode || '']
      });
      for (const b of eco.businesses) {
        statements.push({
          sql: INSERT_BUSINESS,
          args: [
            b.id,
            eco.id,
            b.name,
            b.segment,
            b.businessType,
            b.lat,
            b.lng,
            b.branchCode || '',
            JSON.stringify(b.productsHeld || []),
            b.ecommercePotential || 0,
            b.socialNetworkStrength || 0,
            b.priorityScore || 0,
            b.priorityTier || 'Low',
            b.mandiriCustomer ? 1 : 0
          ]
        });
      }
      for (const r of eco.relationships) {
        statements.push({
          sql: INSERT_RELATIONSHIP,
          args: [
            eco.id,
            r.fromBusinessId,
            r.toBusinessId,
            r.relationshipType,
            r.category || '',
            r.transactionValue || 0,
            r.transactionVolume || 0,
            r.closedLoop ? 1 : 0
          ]
        });
      }
    }

    await writeBatch(statements);

    const enriched = parsed.ecosystems.map(eco => {
      const serialized = serializeEcosystem(eco);
      return { ...serialized, metrics: calculateEchoMetrics(serialized) };
    });
    res.json({ success: true, ...parsed.stats, ecosystems: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

app.patch('/api/echo/businesses/:id', ah(async (req, res) => {
  const { id } = req.params;
  const { mandiri_customer, mandiriCustomer, priority_score, priorityScore, business_type, businessType } = req.body;
  const row = await db.prepare('SELECT * FROM echo_businesses WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Business not found' });
  const isMandiri = mandiri_customer !== undefined ? mandiri_customer : mandiriCustomer;
  const prio = priority_score !== undefined ? priority_score : priorityScore;
  const btype = business_type !== undefined ? business_type : businessType;
  if (isMandiri !== undefined) await db.prepare('UPDATE echo_businesses SET mandiri_customer = ? WHERE id = ?').run(isMandiri ? 1 : 0, id);
  if (prio !== undefined) await db.prepare('UPDATE echo_businesses SET priority_score = ? WHERE id = ?').run(Number(prio), id);
  if (btype !== undefined) await db.prepare('UPDATE echo_businesses SET business_type = ? WHERE id = ?').run(String(btype), id);
  const eco = await db.prepare('SELECT * FROM echo_ecosystems WHERE id = ?').get(row.ecosystem_id);
  const businesses = await db.prepare('SELECT * FROM echo_businesses WHERE ecosystem_id = ? ORDER BY name').all(eco.id);
  const relationships = await db.prepare('SELECT * FROM echo_relationships WHERE ecosystem_id = ? ORDER BY id').all(eco.id);
  const serialized = serializeEcosystem({ ...eco, businesses, relationships });
  res.json({ ecosystem: serialized, metrics: calculateEchoMetrics(serialized) });
}));

app.delete('/api/echo/ecosystems/:id', ah(async (req, res) => {
  const { id } = req.params;
  const row = await db.prepare('SELECT * FROM echo_ecosystems WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Ecosystem not found' });
  await db.prepare('DELETE FROM echo_relationships WHERE ecosystem_id = ?').run(id);
  await db.prepare('DELETE FROM echo_businesses WHERE ecosystem_id = ?').run(id);
  await db.prepare('DELETE FROM echo_ecosystems WHERE id = ?').run(id);
  res.json({ success: true, deletedId: id });
}));

app.get('/api/denyut/stats', ah(async (req, res) => {
  // All eight reads are independent, so they are issued concurrently. Done
  // sequentially each one costs a full network round trip to the database.
  const [
    totalCustomers,
    totalAccounts,
    totalSignals,
    totalBalance,
    signalRows,
    urgencyRows,
    periodRows,
    totalLending,
    totalLendingAccounts
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM customers').get(),
    db.prepare('SELECT COUNT(*) as cnt FROM accounts').get(),
    db.prepare('SELECT COUNT(*) as cnt FROM denyut_signals').get(),
    db.prepare('SELECT COALESCE(SUM(cbalrp), 0) as val FROM customer_balances').get(),
    db.prepare('SELECT status, COUNT(*) as cnt FROM denyut_signals GROUP BY status').all(),
    db.prepare('SELECT urgency, COUNT(*) as cnt FROM denyut_signals GROUP BY urgency').all(),
    db.prepare('SELECT DISTINCT template_period FROM accounts ORDER BY template_period').all(),
    db.prepare('SELECT COALESCE(SUM(outstanding_balance), 0) as val FROM lending_balances').get(),
    db.prepare('SELECT COUNT(*) as cnt FROM lending_balances').get()
  ]);

  const signalCounts = {};
  for (const row of signalRows) {
    signalCounts[row.status] = row.cnt;
  }

  const urgencyCounts = {};
  for (const row of urgencyRows) {
    urgencyCounts[row.urgency] = row.cnt;
  }

  res.json({
    totalCustomers: totalCustomers.cnt,
    totalAccounts: totalAccounts.cnt,
    totalBalance: totalBalance.val,
    totalSignals: totalSignals.cnt,
    signalCounts,
    urgencyCounts,
    periods: periodRows.map(r => r.template_period),
    totalLending: totalLending.val,
    totalLendingAccounts: totalLendingAccounts.cnt
  });
}));

app.get('/api/denyut/search', ah(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ customers: [] });
  const results = await db.prepare(`
    SELECT DISTINCT c.cifno, c.name, c.segment, c.branch_code, c.branch_name, c.hub_id, c.status,
      (SELECT COUNT(*) FROM accounts WHERE cifno = c.cifno) as account_count,
      (SELECT COALESCE(cb.cbalrp, 0) FROM customer_balances cb WHERE cb.cifno = c.cifno) as latest_balance,
      (SELECT COALESCE(SUM(lb.outstanding_balance), 0) FROM lending_balances lb WHERE lb.cifno = c.cifno) as lending_outstanding
    FROM customers c
    WHERE c.cifno LIKE ? OR c.name LIKE ?
    LIMIT 50
  `).all(`%${q}%`, `%${q}%`);
  res.json({ customers: results });
}));

app.get('/api/denyut/customer/:cifno', ah(async (req, res) => {
  const { cifno } = req.params;
  // The customer row is fetched first only because it drives the 404.
  const customer = await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM accounts WHERE cifno = c.cifno) as account_count, (SELECT COALESCE(cb.cbalrp, 0) FROM customer_balances cb WHERE cb.cifno = c.cifno) as latest_balance FROM customers c WHERE cifno = ?').get([cifno]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  // Everything else is independent of the row above, so it runs concurrently.
  const [portfolio, yearData, signals, lendingPortfolio, balanceBreakdown] = await Promise.all([
    db.prepare('SELECT * FROM accounts WHERE cifno = ? ORDER BY template_period DESC').all([cifno]),
    db.prepare(`
      SELECT template_period,
        COALESCE(SUM(CAST(cbalrp AS REAL)), 0) as total_balance,
        COALESCE(SUM(CAST(avgbalrp AS REAL)), 0) as avg_balance,
        COUNT(*) as account_count,
        GROUP_CONCAT(DISTINCT actype) as product_types
      FROM accounts
      WHERE cifno = ?
      GROUP BY template_period
      ORDER BY template_period
    `).all([cifno]),
    db.prepare('SELECT * FROM denyut_signals WHERE cifno = ? ORDER BY detected_at DESC').all([cifno]),
    db.prepare('SELECT * FROM lending_balances WHERE cifno = ? ORDER BY outstanding_balance DESC').all([cifno]),
    db.prepare('SELECT product_breakdown FROM customer_balances WHERE cifno = ?').get([cifno])
  ]);

  let productBreakdown = {};
  if (balanceBreakdown && balanceBreakdown.product_breakdown) {
    try {
      productBreakdown = JSON.parse(balanceBreakdown.product_breakdown);
    } catch (e) {
      productBreakdown = {};
    }
  }

  res.json({ customer, portfolio, yearData, signals, lendingPortfolio, productBreakdown });
}));

app.patch('/api/denyut/signal/:id', ah(async (req, res) => {
  const { id } = req.params;
  const { status, assigned_rm } = req.body;
  const updates = [];
  const params = [];
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (assigned_rm !== undefined) { updates.push('assigned_rm = ?'); params.push(assigned_rm); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  await db.prepare(`UPDATE denyut_signals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = await db.prepare('SELECT * FROM denyut_signals WHERE id = ?').get([id]);
  res.json(updated);
}));

app.post('/api/upload/preview', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const data = await previewXlsx(req.file.path);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

app.post('/api/upload/confirm', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let mapping = null;
  if (req.body && req.body.mapping) {
    try { mapping = JSON.parse(req.body.mapping); } catch { mapping = null; }
  }
  try {
    const result = await parseSenatorMapData(req.file.path, mapping);
    await db.prepare('INSERT OR REPLACE INTO default_data (data_type, data, stats) VALUES (?, ?, ?)').run('senator', JSON.stringify(result.data), JSON.stringify(result.stats));
    res.json({ success: true, data: result.data, stats: result.stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    discardUpload(req);
  }
}));

// The senator map keeps its records in the default_data blob
// (data_type = 'senator'), not in the legacy merchants table, so
// status and SOROT edits are applied there and survive a refresh
// or a redeploy.
async function loadSenatorRows() {
  const row = await db.prepare('SELECT data, stats FROM default_data WHERE data_type = ?').get(['senator']);
  if (!row) return { data: [], stats: {} };
  try {
    return {
      data: JSON.parse(row.data),
      stats: row.stats ? JSON.parse(row.stats) : {}
    };
  } catch {
    return { data: [], stats: {} };
  }
}

async function saveSenatorRows(data, stats) {
  await db.prepare('INSERT OR REPLACE INTO default_data (data_type, data, stats) VALUES (?, ?, ?)').run('senator', JSON.stringify(data), JSON.stringify(stats));
}

app.patch('/api/merchants/:id/status', ah(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const { data, stats } = await loadSenatorRows();
  const location = data.find((loc) => String(loc.id) === String(id));
  if (!location) {
    return res.status(404).json({ success: false, error: `Location ${id} not found` });
  }
  const oldStatus = location.status;
  location.status = status;
  if (stats.byStatus) {
    stats.byStatus[oldStatus] = Math.max(0, (stats.byStatus[oldStatus] || 1) - 1);
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
  }
  await saveSenatorRows(data, stats);
  res.json({ success: true, data: location, stats });
}));

app.patch('/api/merchants/:id/sorot', ah(async (req, res) => {
  const { id } = req.params;
  // The map sends { contentLink }; older callers used { reason }.
  const contentLink = req.body?.contentLink ?? req.body?.reason ?? '';
  const { data, stats } = await loadSenatorRows();
  const location = data.find((loc) => String(loc.id) === String(id));
  if (!location) {
    return res.status(404).json({ success: false, error: `Location ${id} not found` });
  }
  location.sorotLink = contentLink;
  await saveSenatorRows(data, stats);
  res.json({ success: true, data: location });
}));

app.get('/api/merchants', ah(async (req, res) => {
  const merchants = await db.prepare('SELECT * FROM merchants ORDER BY id LIMIT 100').all();
  res.json(merchants);
}));

function previewXlsx(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!jsonData || jsonData.length === 0) {
        resolve({ columns: [], sampleRows: [], totalRows: 0 });
        return;
      }

      const columns = jsonData[0] || [];
      const sampleRows = jsonData.slice(1, 11);
      const totalRows = jsonData.length - 1;

      resolve({ columns, sampleRows, totalRows });
    } catch (e) {
      reject(e);
    }
  });
}

// Catches anything an async route rejected, so a database failure returns a
// 500 instead of leaving the request hanging.
app.use((err, req, res, next) => {
  console.error('[api]', req.method, req.originalUrl, '-', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Serve the production frontend build (client/dist) for all non-API routes.
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { maxAge: '1y', etag: true }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return;
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// The schema is created before the port opens so the health check cannot pass
// against a half-initialised database.
initDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Server running on ${HOST}:${PORT} (db: ${isRemote ? 'remote libsql' : 'local file'})`);
    });
  })
  .catch((err) => {
    console.error('Database initialisation failed:', err);
    process.exit(1);
  });
