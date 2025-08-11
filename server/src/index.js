import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query, getClient } from './db.js';
import { submitSchema } from './validation.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Demo user per brief
const DEMO_USER_ID = 1;
const XP_PER_CORRECT = 10; // documented scoring rule

app.use(cors());
app.use(express.json());

async function getUtcTodayAndYesterday(client) {
  const { rows } = await client.query(`
    SELECT
      (now() AT TIME ZONE 'UTC')::date AS today,
      ((now() AT TIME ZONE 'UTC')::date - INTERVAL '1 day')::date AS yesterday
  `);
  return { today: rows[0].today, yesterday: rows[0].yesterday };
}

// GET /api/lessons - list lessons with progress
app.get('/api/lessons', async (_req, res) => {
  try {
    const lessonsRes = await query(`
      SELECT l.id, l.title, l.description, l.order_index,
             COUNT(p.id)::int AS total_count
      FROM lessons l
      LEFT JOIN problems p ON p.lesson_id = l.id
      GROUP BY l.id
      ORDER BY l.order_index ASC, l.id ASC
    `);

    const progressRes = await query(
      `SELECT lesson_id, solved_count, total_count FROM user_progress WHERE user_id = $1`,
      [DEMO_USER_ID]
    );
    const progressMap = new Map(progressRes.rows.map(r => [r.lesson_id, r]));

    const result = lessonsRes.rows.map(l => {
      const prog = progressMap.get(l.id) || { solved_count: 0, total_count: l.total_count };
      const percent = prog.total_count > 0 ? Math.round((prog.solved_count / prog.total_count) * 100) : 0;
      return {
        id: l.id,
        title: l.title,
        description: l.description,
        progress: {
          solved_count: prog.solved_count,
          total_count: prog.total_count,
          percent,
          completed: prog.solved_count === prog.total_count && prog.total_count > 0
        }
      };
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lessons/:id - lesson with problems (no correct answers leaked)
app.get('/api/lessons/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid lesson id' });

  try {
    const lessonRes = await query(`SELECT id, title, description FROM lessons WHERE id=$1`, [id]);
    if (lessonRes.rowCount === 0) return res.status(404).json({ error: 'Lesson not found' });

    const problemsRes = await query(
      `SELECT id, type, prompt FROM problems WHERE lesson_id=$1 ORDER BY id ASC`,
      [id]
    );

    const problemIds = problemsRes.rows.map(p => p.id);
    let optionsByProblem = new Map();
    if (problemIds.length > 0) {
      const optsRes = await query(
        `SELECT id, problem_id, label FROM problem_options WHERE problem_id = ANY($1::int[]) ORDER BY id ASC`,
        [problemIds]
      );
      optsRes.rows.forEach(o => {
        if (!optionsByProblem.has(o.problem_id)) optionsByProblem.set(o.problem_id, []);
        optionsByProblem.get(o.problem_id).push({ id: o.id, label: o.label });
      });
    }

    const problems = problemsRes.rows.map(p => ({
      id: p.id,
      type: p.type,
      prompt: p.prompt,
      options: optionsByProblem.get(p.id) || []
    }));

    res.json({
      id: lessonRes.rows[0].id,
      title: lessonRes.rows[0].title,
      description: lessonRes.rows[0].description,
      problems
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lessons/:id/submit - idempotent submission with streak/xp updates
app.post('/api/lessons/:id/submit', async (req, res) => {
  const lessonId = Number(req.params.id);
  if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ error: 'Invalid lesson id' });

  const parse = submitSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(422).json({ error: 'Validation failed', details: parse.error.issues });
  }
  const { attempt_id, answers } = parse.data;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const existing = await client.query(
      `SELECT result FROM submissions WHERE user_id=$1 AND lesson_id=$2 AND attempt_id=$3 FOR UPDATE`,
      [DEMO_USER_ID, lessonId, attempt_id]
    );
    if (existing.rowCount > 0) {
      await client.query('COMMIT');
      return res.json(existing.rows[0].result);
    }

    // Verify lesson
    const lessonRes = await client.query(`SELECT id FROM lessons WHERE id=$1`, [lessonId]);
    if (lessonRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Load problems
    const probsRes = await client.query(
      `SELECT id, type, answer_text, explanation_text FROM problems WHERE lesson_id=$1 ORDER BY id ASC`,
      [lessonId]
    );
    if (probsRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Lesson has no problems' });
    }
    const problems = probsRes.rows;
    const problemById = new Map(problems.map(p => [p.id, p]));

    // Load MCQ options with correctness map
    const mcqIds = problems.filter(p => p.type === 'mcq').map(p => p.id);
    const validOptionsByProblem = new Map();
    const correctOptionByProblem = new Map();
    if (mcqIds.length > 0) {
      const opts = await client.query(
        `SELECT id, problem_id, is_correct FROM problem_options WHERE problem_id = ANY($1::int[])`,
        [mcqIds]
      );
      for (const o of opts.rows) {
        if (!validOptionsByProblem.has(o.problem_id)) validOptionsByProblem.set(o.problem_id, new Set());
        validOptionsByProblem.get(o.problem_id).add(o.id);
        if (o.is_correct) correctOptionByProblem.set(o.problem_id, o.id);
      }
    }

    // Validate answers reference this lesson
    for (const a of answers) {
      if (!problemById.has(a.problem_id)) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Answer references a problem not in lesson', problem_id: a.problem_id });
      }
      const p = problemById.get(a.problem_id);
      if (p.type === 'mcq') {
        if (typeof a.option_id !== 'number') {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'MCQ answer must include option_id', problem_id: a.problem_id });
        }
        if (!validOptionsByProblem.get(a.problem_id) || !validOptionsByProblem.get(a.problem_id).has(a.option_id)) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'Invalid option for problem', problem_id: a.problem_id });
        }
      } else if (p.type === 'input') {
        if (typeof a.value !== 'string') {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'Input answer must include value', problem_id: a.problem_id });
        }
      }
    }

    // Compute correctness
    const results = [];
    let correctCount = 0;
    for (const p of problems) {
      const provided = answers.find(a => a.problem_id === p.id);
      if (!provided) continue; // unanswered
      let correct = false;
      if (p.type === 'mcq') {
        correct = provided.option_id === correctOptionByProblem.get(p.id);
      } else {
        const expected = (p.answer_text || '').trim();
        const got = (provided.value || '').trim();
        const nExp = Number(expected);
        const nGot = Number(got);
        if (!Number.isNaN(nExp) && !Number.isNaN(nGot)) {
          correct = nExp === nGot;
        } else {
          correct = expected.toLowerCase() === got.toLowerCase();
        }
      }
      if (correct) correctCount += 1;
      results.push({
        problem_id: p.id,
        correct,
        your_answer: provided.option_id ?? provided.value ?? null,
        explanation: p.explanation_text || null
      });
    }

    const xpGained = correctCount * XP_PER_CORRECT;

    // Update user_progress (merge correct_map)
    const progRes = await client.query(
      `SELECT correct_map, solved_count, total_count FROM user_progress WHERE user_id=$1 AND lesson_id=$2 FOR UPDATE`,
      [DEMO_USER_ID, lessonId]
    );

    const totalCount = problems.length;
    let correctMap = {};
    if (progRes.rowCount > 0) {
      correctMap = progRes.rows[0].correct_map || {};
    }
    for (const r of results) {
      if (r.correct) correctMap[r.problem_id] = true;
    }
    const solvedCount = Object.values(correctMap).filter(Boolean).length;

    if (progRes.rowCount > 0) {
      await client.query(
        `UPDATE user_progress SET correct_map=$3, solved_count=$4, total_count=$5, updated_at=now() WHERE user_id=$1 AND lesson_id=$2`,
        [DEMO_USER_ID, lessonId, correctMap, solvedCount, totalCount]
      );
    } else {
      await client.query(
        `INSERT INTO user_progress (user_id, lesson_id, correct_map, solved_count, total_count) VALUES ($1,$2,$3,$4,$5)`,
        [DEMO_USER_ID, lessonId, correctMap, solvedCount, totalCount]
      );
    }

    // Update streak & XP (transaction-safe)
    const userRes = await client.query(
      `SELECT total_xp, current_streak, best_streak, last_activity_date FROM users WHERE id=$1 FOR UPDATE`,
      [DEMO_USER_ID]
    );
    if (userRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Demo user not found' });
    }
    const user = userRes.rows[0];
    const { today, yesterday } = await getUtcTodayAndYesterday(client);

    let newCurrent = user.current_streak;
    let newBest = user.best_streak;
    let streakChange = 'no_change';

    const last = user.last_activity_date; // PG date
    if (last === null) {
      newCurrent = 1;
      streakChange = 'incremented';
    } else if (String(last) === String(today)) {
      // same day -> no change
    } else if (String(last) === String(yesterday)) {
      newCurrent = Number(user.current_streak) + 1;
      streakChange = 'incremented';
    } else {
      newCurrent = 1;
      streakChange = 'reset';
    }
    if (newCurrent > newBest) newBest = newCurrent;

    const newXP = Number(user.total_xp) + xpGained;
    await client.query(
      `UPDATE users SET total_xp=$2, current_streak=$3, best_streak=$4, last_activity_date=$5, updated_at=now() WHERE id=$1`,
      [DEMO_USER_ID, newXP, newCurrent, newBest, today]
    );

    const lessonPercent = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
    const responsePayload = {
      attempt_id,
      lesson_id: lessonId,
      xp_gained: xpGained,
      total_xp: newXP,
      streak: { current: newCurrent, best: newBest, change: streakChange },
      lesson_progress: {
        solved_count: solvedCount, total_count: totalCount,
        percent: lessonPercent, completed: solvedCount === totalCount && totalCount > 0
      },
      results
    };

    await client.query(
      `INSERT INTO submissions (user_id, lesson_id, attempt_id, answers, result, xp_awarded, correct_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [DEMO_USER_ID, lessonId, attempt_id, JSON.stringify(answers), responsePayload, xpGained, correctCount]
    );

    await client.query('COMMIT');
    res.json(responsePayload);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      // Unique violation: attempt id; return stored result
      try {
        const r = await query(
          `SELECT result FROM submissions WHERE user_id=$1 AND lesson_id=$2 AND attempt_id=$3`,
          [DEMO_USER_ID, lessonId, req.body.attempt_id]
        );
        if (r.rowCount > 0) return res.json(r.rows[0].result);
      } catch {}
      return res.status(409).json({ error: 'Duplicate attempt_id' });
    }
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /api/profile - user stats
app.get('/api/profile', async (_req, res) => {
  try {
    const userRes = await query(
      `SELECT total_xp, current_streak, best_streak FROM users WHERE id=$1`,
      [DEMO_USER_ID]
    );
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'Demo user not found' });

    const prog = await query(
      `SELECT COALESCE(SUM(solved_count),0)::int as solved, COALESCE(SUM(total_count),0)::int as total FROM user_progress WHERE user_id=$1`,
      [DEMO_USER_ID]
    );
    const solved = prog.rows[0].solved;
    const total = prog.rows[0].total;
    const percent = total > 0 ? Math.round((solved / total) * 100) : 0;

    res.json({
      total_xp: userRes.rows[0].total_xp,
      current_streak: userRes.rows[0].current_streak,
      best_streak: userRes.rows[0].best_streak,
      progress_percentage: percent
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Adaptive Practice ---

// GET /api/practice/adaptive - returns up to 5 problems the user hasn't solved yet
app.get('/api/practice/adaptive', async (_req, res) => {
  try {
    const unsolved = await query(`
      SELECT p.id AS problem_id, p.lesson_id, p.type, p.prompt
      FROM problems p
      JOIN lessons l ON l.id = p.lesson_id
      LEFT JOIN user_progress up ON up.user_id = $1 AND up.lesson_id = p.lesson_id
      WHERE COALESCE((up.correct_map ->> p.id::text)::boolean, false) = false
      ORDER BY l.order_index ASC, p.id ASC
      LIMIT 5
    `, [DEMO_USER_ID]);

    let items = unsolved.rows;

    if (items.length < 5) {
      const fill = await query(`
        SELECT p.id AS problem_id, p.lesson_id, p.type, p.prompt
        FROM problems p
        JOIN lessons l ON l.id = p.lesson_id
        ORDER BY l.order_index ASC, p.id ASC
        LIMIT $1
      `, [5 - items.length]);
      const have = new Set(items.map(i => i.problem_id));
      for (const r of fill.rows) if (!have.has(r.problem_id)) items.push(r);
    }

    const ids = items.map(i => i.problem_id);
    let optionsByProblem = new Map();
    if (ids.length) {
      const opts = await query(`
        SELECT id, problem_id, label
        FROM problem_options
        WHERE problem_id = ANY($1::int[])
        ORDER BY id ASC
      `, [ids]);
      for (const o of opts.rows) {
        if (!optionsByProblem.has(o.problem_id)) optionsByProblem.set(o.problem_id, []);
        optionsByProblem.get(o.problem_id).push({ id: o.id, label: o.label });
      }
    }

    const problems = items.map(i => ({
      id: i.problem_id,
      lesson_id: i.lesson_id,
      type: i.type,
      prompt: i.prompt,
      options: optionsByProblem.get(i.problem_id) || []
    }));

    res.json({ problems });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/practice/submit - idempotent per (user, attempt_id)
app.post('/api/practice/submit', async (req, res) => {
  const parse = submitSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(422).json({ error: 'Validation failed', details: parse.error.issues });
  }
  const { attempt_id, answers } = parse.data;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT result FROM practice_submissions WHERE user_id=$1 AND attempt_id=$2 FOR UPDATE`,
      [DEMO_USER_ID, attempt_id]
    );
    if (existing.rowCount > 0) {
      await client.query('COMMIT');
      return res.json(existing.rows[0].result);
    }

    const problemIds = answers.map(a => a.problem_id);
    if (!problemIds.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'No answers provided' });
    }
    const probsRes = await client.query(
      `SELECT id, lesson_id, type, answer_text, explanation_text FROM problems WHERE id = ANY($1::int[])`,
      [problemIds]
    );
    if (probsRes.rowCount !== problemIds.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Some problems not found' });
    }
    const problems = probsRes.rows;
    const problemById = new Map(problems.map(p => [p.id, p]));

    const mcqIds = problems.filter(p => p.type === 'mcq').map(p => p.id);
    const validOptionsByProblem = new Map();
    const correctOptionByProblem = new Map();
    if (mcqIds.length > 0) {
      const opts = await client.query(
        `SELECT id, problem_id, is_correct FROM problem_options WHERE problem_id = ANY($1::int[])`,
        [mcqIds]
      );
      for (const o of opts.rows) {
        if (!validOptionsByProblem.has(o.problem_id)) validOptionsByProblem.set(o.problem_id, new Set());
        validOptionsByProblem.get(o.problem_id).add(o.id);
        if (o.is_correct) correctOptionByProblem.set(o.problem_id, o.id);
      }
    }

    for (const a of answers) {
      const p = problemById.get(a.problem_id);
      if (!p) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Problem not found', problem_id: a.problem_id });
      }
      if (p.type === 'mcq') {
        if (typeof a.option_id !== 'number' || !validOptionsByProblem.get(p.id)?.has(a.option_id)) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'Invalid option for problem', problem_id: a.problem_id });
        }
      } else {
        if (typeof a.value !== 'string') {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'Input answer must include value', problem_id: a.problem_id });
        }
      }
    }

    const results = [];
    let correctCount = 0;
    for (const a of answers) {
      const p = problemById.get(a.problem_id);
      let correct = false;
      if (p.type === 'mcq') {
        correct = a.option_id === correctOptionByProblem.get(p.id);
      } else {
        const expected = (p.answer_text || '').trim();
        const got = (a.value || '').trim();
        const nExp = Number(expected);
        const nGot = Number(got);
        if (!Number.isNaN(nExp) && !Number.isNaN(nGot)) correct = nExp === nGot;
        else correct = expected.toLowerCase() === got.toLowerCase();
      }
      if (correct) correctCount += 1;
      results.push({
        problem_id: p.id,
        lesson_id: p.lesson_id,
        correct,
        your_answer: a.option_id ?? a.value ?? null,
        explanation: p.explanation_text || null
      });
    }

    const xpGained = correctCount * XP_PER_CORRECT;

    // Merge progress per lesson
    const groupedByLesson = new Map();
    for (const p of problems) groupedByLesson.set(p.lesson_id, []);
    for (const r of results) groupedByLesson.get(r.lesson_id).push(r);

    for (const [lessonId, rs] of groupedByLesson) {
      const totalCountRes = await client.query(`SELECT COUNT(*)::int AS c FROM problems WHERE lesson_id=$1`, [lessonId]);
      const totalCount = totalCountRes.rows[0].c;

      const progRes = await client.query(
        `SELECT correct_map FROM user_progress WHERE user_id=$1 AND lesson_id=$2 FOR UPDATE`,
        [DEMO_USER_ID, lessonId]
      );
      let correctMap = {};
      if (progRes.rowCount > 0) correctMap = progRes.rows[0].correct_map || {};
      for (const r of rs) if (r.correct) correctMap[r.problem_id] = true;
      const solvedCount = Object.values(correctMap).filter(Boolean).length;

      if (progRes.rowCount > 0) {
        await client.query(
          `UPDATE user_progress SET correct_map=$3, solved_count=$4, total_count=$5, updated_at=now() WHERE user_id=$1 AND lesson_id=$2`,
          [DEMO_USER_ID, lessonId, correctMap, solvedCount, totalCount]
        );
      } else {
        await client.query(
          `INSERT INTO user_progress (user_id, lesson_id, correct_map, solved_count, total_count) VALUES ($1,$2,$3,$4,$5)`,
          [DEMO_USER_ID, lessonId, correctMap, solvedCount, totalCount]
        );
      }
    }

    // Streak & XP
    const userRes = await client.query(
      `SELECT total_xp, current_streak, best_streak, last_activity_date FROM users WHERE id=$1 FOR UPDATE`,
      [DEMO_USER_ID]
    );
    const user = userRes.rows[0];
    const { today, yesterday } = await getUtcTodayAndYesterday(client);

    let newCurrent = user.current_streak;
    let newBest = user.best_streak;
    let streakChange = 'no_change';

    const last = user.last_activity_date;
    if (last === null) { newCurrent = 1; streakChange = 'incremented'; }
    else if (String(last) === String(today)) { /* no change */ }
    else if (String(last) === String(yesterday)) { newCurrent = Number(user.current_streak) + 1; streakChange = 'incremented'; }
    else { newCurrent = 1; streakChange = 'reset'; }
    if (newCurrent > newBest) newBest = newCurrent;

    const newXP = Number(user.total_xp) + xpGained;
    await client.query(
      `UPDATE users SET total_xp=$2, current_streak=$3, best_streak=$4, last_activity_date=$5, updated_at=now() WHERE id=$1`,
      [DEMO_USER_ID, newXP, newCurrent, newBest, today]
    );

    const summaryProgress = {
      solved_count: correctCount,
      total_count: results.length,
      percent: results.length ? Math.round((correctCount / results.length) * 100) : 0,
      completed: false
    };

    const responsePayload = {
      attempt_id,
      xp_gained: xpGained,
      total_xp: newXP,
      streak: { current: newCurrent, best: newBest, change: streakChange },
      lesson_progress: summaryProgress,
      results
    };

    await client.query(
      `INSERT INTO practice_submissions (user_id, attempt_id, answers, result, xp_awarded, correct_count)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [DEMO_USER_ID, attempt_id, JSON.stringify(answers), responsePayload, xpGained, correctCount]
    );

    await client.query('COMMIT');
    res.json(responsePayload);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      try {
        const r = await query(
          `SELECT result FROM practice_submissions WHERE user_id=$1 AND attempt_id=$2`,
          [DEMO_USER_ID, req.body.attempt_id]
        );
        if (r.rowCount > 0) return res.json(r.rows[0].result);
      } catch {}
      return res.status(409).json({ error: 'Duplicate attempt_id' });
    }
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
