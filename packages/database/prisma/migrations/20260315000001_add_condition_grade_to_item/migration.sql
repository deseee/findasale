-- #64 Condition Grading: add conditionGrade field to Item
-- Grades: S (like new) | A (excellent) | B (good) | C (fair) | D (poor)
ALTER TABLE "Item" ADD COLUMN "conditionGrade" TEXT;
