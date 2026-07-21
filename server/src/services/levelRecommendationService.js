const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * Evidence-based level placement for intake applicants.
 *
 * Applicants self-select a level on the apply form; nothing verifies it, so a
 * "Beginner" with three years of experience (or an "Advanced" who has never
 * shipped anything) stays misplaced. This reads what they actually wrote —
 * intake answers, assessment answers, score — and recommends a level.
 *
 * The split matters:
 *   - the AI only EXTRACTS evidence: per criterion true/false/unclear plus a
 *     verbatim quote from the applicant's own words,
 *   - a DETERMINISTIC rule then decides the level from those verdicts.
 * The policy stays the admin's, identical for every applicant and auditable —
 * the model never silently promotes anyone.
 *
 * Rules live on the cohort (`levelRules`) so they're set before review starts
 * and can be edited any time; a cohort without them gets the defaults below.
 */

/** Conservative: only an explicit `true` counts. `unclear`/null never promotes. */
const isMet = (v) => v === true;

/**
 * Default criteria — the Dev-Weekends model, which is a good general shape:
 * a top criterion strong enough to qualify on its own, plus supporting ones
 * where any two together qualify. Every field here is editable per cohort.
 */
function defaultCriteriaForTopLevel() {
  return [
    {
      key: 'experience_1yr',
      label: '1+ year of real software experience',
      how: 'True only when the answers clearly show at least 12 months of real, paid or professional software work (role, organisation, dates). Substantive dated internships count. Course projects, bootcamps and tutorial work do NOT count. Use unclear when the answers are too sparse to tell.',
      soloQualifies: true,
    },
    {
      key: 'production_project',
      label: 'Production-grade / real-world project',
      how: 'True when they describe a project real people actually used — deployed, with users, or built for a client or employer — not a tutorial clone or a course assignment. A detailed description of scope, their own role and the hard parts is the signal. Portfolio or repo links that back the claim strengthen it.',
      soloQualifies: false,
    },
    {
      key: 'problem_solving_depth',
      label: 'Strong problem-solving / CS fundamentals',
      how: 'True when there is concrete evidence of algorithmic or CS depth — a substantial solved-problem count on a practice platform (roughly 150+), competition or contest history, or answers that reason clearly about complexity, data structures or trade-offs. Generic claims like "I practise coding" are not enough.',
      soloQualifies: false,
    },
    {
      key: 'certification',
      label: 'Relevant certification or credential',
      how: 'True when they name a specific, verifiable technical certification or credential relevant to the program. Vague claims of "certified" with no issuer or name do not count.',
      soloQualifies: false,
    },
  ];
}

function defaultCriteriaForMiddleLevel() {
  return [
    {
      key: 'beyond_tutorials',
      label: 'Has built something beyond tutorials',
      how: 'True when they describe at least one project they designed or extended themselves — their own idea, or a meaningful extension of an exercise — and can explain what they built and why. Following a tutorial step by step does not count.',
      soloQualifies: false,
    },
    {
      key: 'language_comfort',
      label: 'Comfortable in at least one language or stack',
      how: 'True when the answers show working familiarity with a specific language or stack — naming tools, describing how they used them, or explaining choices. Simply listing technologies is not enough.',
      soloQualifies: false,
    },
  ];
}

class LevelRecommendationService {
  // ── Rules ────────────────────────────────────────────────────────────────
  /**
   * The cohort's level rules, seeded from the defaults when unset. Levels are
   * ordered highest-first (the order they're evaluated in); the lowest level is
   * the base everyone falls back to.
   */
  async getRules(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    const stored = cohort.levelRules;

    if (stored && Array.isArray(stored.levels) && stored.levels.length) {
      // Drop rules whose level no longer exists (the admin renamed/removed it).
      const valid = new Set(levels.map((l) => l.key));
      return {
        levels: stored.levels.filter((r) => valid.has(r.levelKey)),
        baseLevelKey: valid.has(stored.baseLevelKey) ? stored.baseLevelKey : (levels[0] ? levels[0].key : null),
        cohortLevels: levels,
        seeded: false,
      };
    }
    return { ...this.defaultRules(levels), cohortLevels: levels, seeded: true };
  }

  /**
   * Defaults for a cohort's level list. `levels` is in the admin's own order
   * (lowest → highest), so the LAST entry is the top level.
   */
  defaultRules(levels = []) {
    if (!levels.length) return { levels: [], baseLevelKey: null };
    if (levels.length === 1) return { levels: [], baseLevelKey: levels[0].key };

    const ordered = [...levels];
    const base = ordered[0];
    const top = ordered[ordered.length - 1];
    const middles = ordered.slice(1, -1);

    const rules = [
      { levelKey: top.key, minMet: 2, criteria: defaultCriteriaForTopLevel() },
      ...middles.map((m) => ({ levelKey: m.key, minMet: 1, criteria: defaultCriteriaForMiddleLevel() })),
    ];
    // Highest first — the engine takes the first level whose bar is cleared.
    return { levels: rules, baseLevelKey: base.key };
  }

  /** Replace the cohort's rules (validated). */
  async setRules(cohortId, rules) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    const validKeys = new Set(levels.map((l) => l.key));

    if (!rules || !Array.isArray(rules.levels)) throw new ValidationError('levels must be an array');
    const cleaned = rules.levels.map((r) => {
      if (!validKeys.has(r.levelKey)) throw new ValidationError(`Unknown level: ${r.levelKey}`);
      const criteria = (Array.isArray(r.criteria) ? r.criteria : []).map((c, i) => {
        const label = String(c.label || '').trim();
        if (!label) throw new ValidationError('Every criterion needs a label');
        return {
          key: String(c.key || label.toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 60) || `c_${i}`,
          label: label.slice(0, 160),
          how: String(c.how || '').trim().slice(0, 2000),
          soloQualifies: c.soloQualifies === true,
        };
      });
      const minMet = Number.isFinite(Number(r.minMet)) ? Math.max(1, Math.trunc(Number(r.minMet))) : 1;
      return { levelKey: r.levelKey, minMet, criteria };
    });

    const baseLevelKey = validKeys.has(rules.baseLevelKey) ? rules.baseLevelKey : (levels[0] ? levels[0].key : null);
    await cohort.update({ levelRules: { levels: cleaned, baseLevelKey } });
    return this.getRules(cohortId);
  }

  // ── The deterministic decision ───────────────────────────────────────────
  /**
   * Given per-criterion verdicts, pick the level. Evaluated highest-first: a
   * level is reached when ANY solo-qualifying criterion is met, or when at
   * least `minMet` of its criteria are met. Otherwise fall through to base.
   * Pure and synchronous — same inputs always give the same placement.
   */
  decide(rules, verdicts = {}) {
    const trail = [];
    for (const rule of (rules.levels || [])) {
      const met = (rule.criteria || []).filter((c) => isMet(verdicts[c.key]));
      const solo = met.find((c) => c.soloQualifies);
      if (solo) {
        trail.push({ levelKey: rule.levelKey, reached: true, via: 'solo', criterion: solo.key, met: met.map((c) => c.key) });
        return { levelKey: rule.levelKey, via: 'solo', soloCriterion: solo.key, metKeys: met.map((c) => c.key), trail };
      }
      if (met.length >= rule.minMet) {
        trail.push({ levelKey: rule.levelKey, reached: true, via: 'count', met: met.map((c) => c.key) });
        return { levelKey: rule.levelKey, via: 'count', metKeys: met.map((c) => c.key), trail };
      }
      trail.push({ levelKey: rule.levelKey, reached: false, met: met.map((c) => c.key), needed: rule.minMet });
    }
    return { levelKey: rules.baseLevelKey || null, via: 'base', metKeys: [], trail };
  }

  /** Plain-English "why", so the reviewer never sees an unexplained level. */
  buildReason(rules, decision, verdicts, labelFor) {
    const nameOf = (lvlKey) => labelFor(lvlKey) || lvlKey || 'the base level';
    if (decision.via === 'solo') {
      const c = (rules.levels || []).flatMap((r) => r.criteria || []).find((x) => x.key === decision.soloCriterion);
      return `Placed at ${nameOf(decision.levelKey)}: met "${c ? c.label : decision.soloCriterion}", which qualifies on its own.`;
    }
    if (decision.via === 'count') {
      const rule = (rules.levels || []).find((r) => r.levelKey === decision.levelKey);
      const labels = (rule?.criteria || []).filter((c) => decision.metKeys.includes(c.key)).map((c) => `"${c.label}"`);
      return `Placed at ${nameOf(decision.levelKey)}: met ${decision.metKeys.length} of the ${rule?.criteria.length || 0} criteria (${labels.join(', ')}), meeting the bar of ${rule?.minMet}.`;
    }
    const missed = (rules.levels || []).map((r) => {
      const met = (r.criteria || []).filter((c) => isMet(verdicts[c.key])).length;
      return `${nameOf(r.levelKey)} (met ${met} of ${r.criteria.length}, needs ${r.minMet})`;
    });
    return missed.length
      ? `Placed at ${nameOf(decision.levelKey)}: did not clear ${missed.join('; ')}.`
      : `Placed at ${nameOf(decision.levelKey)}.`;
  }

  // ── The AI evidence pass ─────────────────────────────────────────────────
  /** Everything the applicant actually wrote, as grading context. */
  async _evidenceFor(application) {
    const lines = [];
    const resp = application.responses || {};
    for (const [k, v] of Object.entries(resp)) {
      if (v == null || v === '') continue;
      lines.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }

    let answerBlock = '';
    const sub = await models.AssessmentSubmission.findOne({
      where: { applicationId: application.id },
      order: [['submittedAt', 'DESC']],
    });
    if (sub && sub.assessmentId) {
      const assessment = await models.Assessment.findByPk(sub.assessmentId, {
        include: [{ model: models.AssessmentQuestion, as: 'questions' }],
      });
      const questions = [...((assessment && assessment.questions) || [])].sort((a, b) => a.position - b.position);
      const answers = sub.answers || {};
      const parts = [];
      for (const q of questions) {
        const a = answers[q.id] || {};
        let text = '';
        if (q.type === 'mcq' || q.type === 'multi_select') {
          const byId = new Map((q.options || []).map((o) => [o.id, o.label]));
          text = (a.optionIds || []).map((id) => byId.get(id) || id).join('; ');
        } else if (q.type === 'file_upload') text = a.fileUrl ? `(file: ${a.fileName || a.fileUrl})` : '';
        else if (q.type === 'external_link') text = a.link || '';
        else text = a.text || '';
        if (text) parts.push(`Q: ${q.prompt}\nA: ${text}`);
      }
      answerBlock = parts.join('\n\n');
    }
    return { profileLines: lines, answerBlock, submission: sub };
  }

  /**
   * Recommend a level for ONE applicant. The AI returns a verdict + verbatim
   * quote per criterion; the rule engine decides. Stores both on the
   * application so the reviewer can see exactly why.
   */
  async recommendForApplication(applicationId, actorId) {
    const groqService = require('./groqService');
    const application = await models.Application.findByPk(applicationId);
    if (!application) throw new NotFoundError('Application not found');

    const rules = await this.getRules(application.cohortId);
    const allCriteria = (rules.levels || []).flatMap((r) => r.criteria || []);
    if (!allCriteria.length) {
      return { applicationId, recommended: false, reason: 'no_level_rules' };
    }

    const { profileLines, answerBlock, submission } = await this._evidenceFor(application);
    const labelFor = (key) => (rules.cohortLevels || []).find((l) => l.key === key)?.label || key;

    const criteriaBlock = allCriteria
      .map((c) => `- key: ${c.key}\n  criterion: ${c.label}\n  how to judge: ${c.how || '(judge on the plain meaning of the criterion)'}`)
      .join('\n');

    const prompt = [
      `LEVELS AVAILABLE: ${(rules.cohortLevels || []).map((l) => l.label).join(' · ') || '(none)'}`,
      `APPLICANT SELF-SELECTED: ${labelFor(application.level) || '(none)'}`,
      application.assessmentScore != null ? `ASSESSMENT SCORE: ${application.assessmentScore}` : '',
      '',
      'CRITERIA TO VERIFY:',
      criteriaBlock,
      '',
      'APPLICANT PROFILE (their intake answers):',
      profileLines.length ? profileLines.join('\n') : '(none)',
      '',
      'ASSESSMENT ANSWERS:',
      answerBlock || '(no assessment answers)',
    ].filter(Boolean).join('\n');

    const raw = await groqService.generateText({
      feature: 'assessment',
      userId: actorId,
      temperature: 0.1,
      maxTokens: Math.min(2000, 220 * allCriteria.length + 300),
      system: [
        'You verify placement criteria for a training-program applicant. You do NOT choose their level — you only report, for each criterion, whether the applicant\'s own words prove it.',
        'For EACH criterion return exactly one verdict: true (the evidence clearly proves it), false (the evidence clearly contradicts it or is plainly absent), or unclear (you cannot tell).',
        'Be conservative: only answer true when a specific, concrete detail supports it. Claims with no substance ("I am passionate about coding", "I know many technologies") are NOT evidence. When torn, answer unclear — never guess true.',
        'Every true or false MUST carry `quote`: a short VERBATIM extract from the applicant\'s text that justifies it. Never invent or paraphrase a quote; leave it empty only for unclear.',
        'Also report `coherence`: one short line if their claims contradict the quality of their answers (e.g. claims years of experience but the answers read as a beginner), else an empty string.',
        'Reply with STRICT JSON only, no text outside it: {"criteria":[{"key":"<exact key given>","verdict":"true|false|unclear","quote":"<verbatim or empty>","note":"<one short sentence>"}],"coherence":"<one line or empty>"}.',
      ].join(' '),
      prompt,
    });

    let parsed = {};
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch { parsed = {}; }

    const byKey = new Map(allCriteria.map((c) => [c.key, c]));
    const verdicts = {};
    const details = {};
    for (const row of (Array.isArray(parsed.criteria) ? parsed.criteria : [])) {
      const c = row && byKey.get(String(row.key));
      if (!c) continue;
      const v = String(row.verdict || '').toLowerCase();
      const verdict = v === 'true' ? true : v === 'false' ? false : null;
      verdicts[c.key] = verdict;
      details[c.key] = {
        verdict,
        quote: row.quote ? String(row.quote).slice(0, 500) : '',
        note: row.note ? String(row.note).slice(0, 300) : '',
      };
    }
    // Anything the model skipped stays unknown rather than silently counting.
    for (const c of allCriteria) {
      if (!(c.key in verdicts)) { verdicts[c.key] = null; details[c.key] = { verdict: null, quote: '', note: 'not assessed' }; }
    }

    const decision = this.decide(rules, verdicts);
    const reason = this.buildReason(rules, decision, verdicts, labelFor);

    const evidence = {
      criteria: details,
      decision: { via: decision.via, metKeys: decision.metKeys, trail: decision.trail },
      reason,
      coherence: parsed.coherence ? String(parsed.coherence).slice(0, 300) : '',
      selfSelected: application.level || null,
      matchesSelfSelected: (application.level || null) === (decision.levelKey || null),
      submissionId: submission ? submission.id : null,
      at: new Date().toISOString(),
    };

    await application.update({ recommendedLevel: decision.levelKey, levelEvidence: evidence });
    return { applicationId, recommended: true, recommendedLevel: decision.levelKey, evidence };
  }

  /** Apply the recommendation as the applicant's actual level (admin action). */
  async applyRecommendation(applicationId) {
    const application = await models.Application.findByPk(applicationId);
    if (!application) throw new NotFoundError('Application not found');
    if (!application.recommendedLevel) throw new ValidationError('No recommendation to apply — run level recommendation first');
    await application.update({ level: application.recommendedLevel });
    return application;
  }
}

module.exports = new LevelRecommendationService();
module.exports.defaultCriteriaForTopLevel = defaultCriteriaForTopLevel;
module.exports.defaultCriteriaForMiddleLevel = defaultCriteriaForMiddleLevel;
