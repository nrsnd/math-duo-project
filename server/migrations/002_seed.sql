-- Demo user
INSERT INTO users (id, username, total_xp, current_streak, best_streak, last_activity_date)
VALUES (1, 'demo', 0, 0, 0, NULL)
ON CONFLICT (id) DO NOTHING;

-- Lessons
INSERT INTO lessons (id, title, description, order_index) VALUES
  (1, 'Basic Arithmetic', 'Addition and subtraction for warm-up', 1),
  (2, 'Multiplication Mastery', 'Practice times tables', 2),
  (3, 'Division Basics', 'Intro to division', 3)
ON CONFLICT (id) DO NOTHING;

-- Problems for Lesson 1
INSERT INTO problems (id, lesson_id, type, prompt, answer_text) VALUES
  (101, 1, 'mcq', '7 + 5 = ?', NULL),
  (102, 1, 'mcq', '15 - 9 = ?', NULL),
  (103, 1, 'input', '18 + 27 = ?', '45'),
  (104, 1, 'input', '40 - 17 = ?', '23')
ON CONFLICT (id) DO NOTHING;

INSERT INTO problem_options (problem_id, label, is_correct) VALUES
  (101, '10', FALSE),
  (101, '11', FALSE),
  (101, '12', TRUE),
  (101, '13', FALSE),
  (102, '4', FALSE),
  (102, '6', TRUE),
  (102, '7', FALSE),
  (102, '9', FALSE) ON CONFLICT DO NOTHING;


-- Problems for Lesson 2
INSERT INTO problems (id, lesson_id, type, prompt, answer_text) VALUES
  (201, 2, 'mcq', '6 × 7 = ?', NULL),
  (202, 2, 'mcq', '9 × 3 = ?', NULL),
  (203, 2, 'mcq', '8 × 8 = ?', NULL),
  (204, 2, 'input', '12 × 11 = ?', '132')
ON CONFLICT (id) DO NOTHING;

INSERT INTO problem_options (problem_id, label, is_correct) VALUES
  (201, '40', FALSE),
  (201, '42', TRUE),
  (201, '44', FALSE),
  (201, '48', FALSE),
  (202, '18', TRUE),
  (202, '21', FALSE),
  (202, '24', FALSE),
  (202, '27', FALSE),
  (203, '56', FALSE),
  (203, '60', FALSE),
  (203, '63', FALSE),
  (203, '64', TRUE) ON CONFLICT DO NOTHING;


-- Problems for Lesson 3
INSERT INTO problems (id, lesson_id, type, prompt, answer_text) VALUES
  (301, 3, 'mcq', '36 ÷ 6 = ?', NULL),
  (302, 3, 'mcq', '45 ÷ 5 = ?', NULL),
  (303, 3, 'mcq', '56 ÷ 7 = ?', NULL),
  (304, 3, 'input', '63 ÷ 9 = ?', '7')
ON CONFLICT (id) DO NOTHING;

INSERT INTO problem_options (problem_id, label, is_correct) VALUES
  (301, '5', FALSE),
  (301, '6', TRUE),
  (301, '7', FALSE),
  (302, '7', FALSE),
  (302, '8', FALSE),
  (302, '9', TRUE),
  (303, '6', TRUE),
  (303, '7', FALSE),
  (303, '8', FALSE) ON CONFLICT DO NOTHING;


-- Explanations
UPDATE problems SET explanation_text='7 + 5 = 12. Add the ones: 7 + 3 = 10, then +2 = 12.' WHERE id=101;
UPDATE problems SET explanation_text='15 - 9 = 6. Subtract to ten: 15 - 5 = 10, then -4 = 6.' WHERE id=102;
UPDATE problems SET explanation_text='18 + 27 = 45. Add tens and ones: (10+20) + (8+7) = 30 + 15 = 45.' WHERE id=103;
UPDATE problems SET explanation_text='40 - 17 = 23. Subtract 10 → 30, then subtract 7 → 23.' WHERE id=104;
UPDATE problems SET explanation_text='6 × 7 = 42. Remember 7×6 pattern or 6×(5+2) = 30 + 12.' WHERE id=201;
UPDATE problems SET explanation_text='9 × 3 = 27. Triple 9 → 27.' WHERE id=202;
UPDATE problems SET explanation_text='8 × 8 = 64. Square of 8; memorize 8×8.' WHERE id=203;
UPDATE problems SET explanation_text='12 × 11 = 132. 12×10=120, plus another 12 → 132.' WHERE id=204;
UPDATE problems SET explanation_text='36 ÷ 6 = 6 because 6×6=36.' WHERE id=301;
UPDATE problems SET explanation_text='45 ÷ 5 = 9 because 9×5=45.' WHERE id=302;
UPDATE problems SET explanation_text='56 ÷ 7 = 8 because 8×7=56.' WHERE id=303;
UPDATE problems SET explanation_text='63 ÷ 9 = 7 because 7×9=63.' WHERE id=304;
