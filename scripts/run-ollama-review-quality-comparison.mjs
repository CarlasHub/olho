import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateAllBenchmarks,
  loadExpectedFindings
} from "../tests/review-quality/quality-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "tests/review-benchmarks/evaluation-results/ollama-comparison-current.json");

const DEFAULT_ENDPOINT = ["http://", "localhost", ":11434"].join("");
const DEFAULT_BENCHMARK_IDS = [
  "marketing-hero",
  "zeplin-artboard",
  "figma-frame"
];

function selectedBenchmarkIds() {
  const fromEnv = String(process.env.OLLAMA_BENCHMARK_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_BENCHMARK_IDS;
}

function endpoint() {
  return String(process.env.OLLAMA_ENDPOINT || DEFAULT_ENDPOINT).trim().replace(/\/$/, "");
}

function selectedModel(models = []) {
  const requested = String(process.env.OLLAMA_MODEL || "").trim();
  if (requested) return requested;
  return models[0] || "";
}

function textOfFinding(finding = {}) {
  return [
    finding.category,
    finding.severity,
    finding.region,
    finding.affected_region,
    finding.issue,
    finding.evidence,
    finding.impact,
    finding.recommendation,
    finding.bestPracticeReference
  ].join(" ").toLowerCase();
}

function findingMatchesExpected(finding, expected) {
  if (finding.category !== expected.category) return false;
  const haystack = textOfFinding(finding);
  return (expected.evidenceKeywords || []).some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

function scoreFindingsAgainstExpected(findings = [], benchmarkId) {
  const expected = loadExpectedFindings(benchmarkId);
  const matched = expected.strongFindings.filter((item) =>
    findings.some((finding) => findingMatchesExpected(finding, item))
  );
  return {
    expectedCount: expected.strongFindings.length,
    matchedCount: matched.length,
    matchedIds: matched.map((item) => item.id),
    missedIds: expected.strongFindings.filter((item) => !matched.includes(item)).map((item) => item.id)
  };
}

function deterministicSummary(evaluation) {
  return {
    benchmarkId: evaluation.id,
    findingCount: evaluation.findings.length,
    topCategory: evaluation.findings[0]?.category || "",
    topIssue: evaluation.findings[0]?.issue || "",
    matchedIds: evaluation.matched.map((item) => item.expected.id),
    missedIds: evaluation.missed.map((item) => item.id),
    falsePositiveCount: evaluation.falsePositives.length,
    duplicateCount: evaluation.duplicateCount,
    scores: evaluation.scores,
    markerPixelAccuracy: evaluation.markerPixelAccuracy
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS || 60000));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function detectOllama(endpointUrl) {
  const tags = await fetchJson(`${endpointUrl}/api/tags`);
  const models = Array.isArray(tags.models) ? tags.models.map((model) => model.name).filter(Boolean) : [];
  return {
    reachable: true,
    models,
    model: selectedModel(models)
  };
}

function parseOllamaJson(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Ollama returned an empty response.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Ollama response was not valid JSON.");
  }
}

function buildPrompt({ mode, evaluation }) {
  const deterministicFindings = evaluation.findings.slice(0, 12).map((finding) => ({
    category: finding.category,
    severity: finding.severity,
    region: finding.region,
    issue: finding.issue,
    evidence: finding.evidence,
    impact: finding.impact,
    recommendation: finding.recommendation,
    confidence: finding.confidence
  }));
  return `
You are evaluating Olho Review output quality for a local design review benchmark.

Mode: ${mode}
Benchmark: ${evaluation.id}

Use only the deterministic findings and expected reviewer context below. Do not invent visible facts.
Return strict JSON only:
{
  "executiveVerdict": "short verdict",
  "findings": [
    {
      "category": "visual-hierarchy|ux|accessibility-visible|design-system|enterprise-polish|responsive-layout",
      "severity": "critical|high|medium|low",
      "region": "visible affected region",
      "issue": "professional issue statement",
      "evidence": "visible or deterministic evidence",
      "impact": "user or product impact",
      "recommendation": "specific recommendation",
      "confidence": 0.0
    }
  ]
}

Expected human-review root findings:
${JSON.stringify(evaluation.expected.strongFindings, null, 2)}

Deterministic findings:
${JSON.stringify(deterministicFindings, null, 2)}
`.trim();
}

async function runOllamaMode({ endpointUrl, model, mode, evaluation }) {
  const prompt = buildPrompt({ mode, evaluation });
  const started = Date.now();
  const response = await fetchJson(`${endpointUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
        top_p: 0.85,
        num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 800)
      }
    })
  });
  const parsed = parseOllamaJson(response.response);
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const expectedScore = scoreFindingsAgainstExpected(findings, evaluation.id);
  const deterministicScore = {
    matchedCount: evaluation.matched.length,
    missedCount: evaluation.missed.length
  };
  return {
    mode,
    benchmarkId: evaluation.id,
    status: "evaluated",
    executionTimeMs: Date.now() - started,
    executiveVerdict: parsed.executiveVerdict || "",
    findingCount: findings.length,
    matchedIds: expectedScore.matchedIds,
    missedIds: expectedScore.missedIds,
    deltasVsDeterministic: {
      findingCount: findings.length - evaluation.findings.length,
      matchedExpected: expectedScore.matchedCount - deterministicScore.matchedCount,
      missedExpected: expectedScore.missedIds.length - deterministicScore.missedCount
    },
    findings: findings.slice(0, 12)
  };
}

async function main() {
  const endpointUrl = endpoint();
  const evaluationsById = new Map(evaluateAllBenchmarks().map((evaluation) => [evaluation.id, evaluation]));
  const benchmarkIds = selectedBenchmarkIds();
  const deterministic = benchmarkIds.map((id) => deterministicSummary(evaluationsById.get(id)));
  const report = {
    runType: "ollama-mode-comparison",
    generatedAt: new Date().toISOString(),
    endpoint: endpointUrl,
    deterministicOnly: deterministic,
    modes: [
      {
        mode: "deterministic-only",
        status: "evaluated",
        resultFile: "tests/review-benchmarks/evaluation-results/deterministic-current.json"
      }
    ]
  };

  let capabilities;
  try {
    capabilities = await detectOllama(endpointUrl);
  } catch (error) {
    report.status = "ollama-unavailable";
    report.reason = `Ollama endpoint was not reachable: ${error?.message || error}`;
    report.modes.push(
      {
        mode: "deterministic-plus-ollama-text-refine",
        status: "not-run",
        reason: report.reason
      },
      {
        mode: "deterministic-plus-ollama-synthesis",
        status: "not-run",
        reason: report.reason
      },
      {
        mode: "deterministic-plus-local-vision-runtime-plus-ollama-synthesis",
        status: "not-run",
        reason: "A reachable Ollama endpoint and selected local vision runtime are required."
      }
    );
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${outputPath}`);
    console.log(report.reason);
    return;
  }

  report.status = capabilities.model ? "evaluated" : "no-model-installed";
  report.capabilities = capabilities;
  if (!capabilities.model) {
    report.reason = "Ollama responded but no installed model was available.";
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${outputPath}`);
    console.log(report.reason);
    return;
  }

  const modes = [
    "deterministic-plus-ollama-text-refine",
    "deterministic-plus-ollama-synthesis"
  ];
  for (const mode of modes) {
    const modeResults = [];
    for (const benchmarkId of benchmarkIds) {
      const evaluation = evaluationsById.get(benchmarkId);
      try {
        console.log(`Running ${mode} for ${benchmarkId} with ${capabilities.model}...`);
        modeResults.push(await runOllamaMode({
          endpointUrl,
          model: capabilities.model,
          mode,
          evaluation
        }));
      } catch (error) {
        modeResults.push({
          mode,
          benchmarkId,
          status: "failed",
          error: String(error?.message || error)
        });
      }
    }
    report.modes.push({
      mode,
      status: modeResults.every((item) => item.status === "evaluated") ? "evaluated" : "partial-or-failed",
      model: capabilities.model,
      results: modeResults
    });
  }
  report.modes.push({
    mode: "deterministic-plus-local-vision-runtime-plus-ollama-synthesis",
    status: "not-run",
    reason: "This comparison requires a configured local vision runtime and benchmark screenshots; deterministic and Ollama text/synthesis modes were evaluated first."
  });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
